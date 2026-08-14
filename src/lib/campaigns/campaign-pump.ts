import "server-only";
import type { SupabaseAdmin } from "@/lib/chat/types";

/**
 * Pump de campañas del lado del servidor.
 *
 * Problema que resuelve: el avance por lotes lo venía manejando SÓLO el navegador
 * (el detalle de campaña llama a /api/campanas/process cada 4s). Si esa pestaña se
 * cierra, la campaña se queda pausada con destinatarios en `queued`. Esto dependía
 * de tener un browser abierto — frágil.
 *
 * Solución: un loop que arranca con el servidor (vía instrumentation.register) y
 * drena cualquier campaña en estado `sending`, sin depender del navegador. Al
 * reiniciar el proceso (redeploy), register() lo vuelve a arrancar y retoma las
 * campañas que quedaron a medias.
 *
 * Seguridad de concurrencia: runCampaignProcessOnce hace un claim atómico
 * (queued -> sending vía CAS), así que aunque corran a la vez el pump, el poll del
 * navegador y/o varias réplicas del server, cada destinatario se envía UNA sola vez.
 */

const INTERVAL_MS = clampInt(process.env.CAMPAIGN_PUMP_INTERVAL_MS, 8000, 2000, 120000);
const BATCH = clampInt(process.env.CAMPAIGN_PUMP_BATCH, 25, 1, 100);
const LOG = "[campaign-pump]";

let started = false;
let running = false;

function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** ¿Debe correr el pump en este proceso? Prod + single_client por defecto; override por env. */
export function isCampaignPumpEnabled(): boolean {
  const flag = process.env.CAMPAIGN_PUMP_ENABLED?.trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  // Default: sólo en producción y single_client (evita disparar envíos desde `next dev` local).
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEURA_INSTANCE_MODE === "single_client"
  );
}

/** Idempotente: arranca el loop una sola vez por proceso. */
export function startCampaignPump(): void {
  if (started) return;
  started = true;
  console.info(LOG, "iniciado", { intervalMs: INTERVAL_MS, batch: BATCH });
  const timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  // No mantener vivo el proceso sólo por el timer (permite shutdown limpio).
  if (typeof timer.unref === "function") timer.unref();
}

async function tick(): Promise<void> {
  if (running) return; // sin reentrancia: si un tick tarda más que el intervalo, el siguiente se saltea
  running = true;
  try {
    const { getChatServiceClientForEmpresa } = await import(
      "@/lib/supabase/chat-service-role-empresa"
    );
    const { runCampaignProcessOnce } = await import("@/lib/campaigns/campaign-job-service");

    // single_client: el empresaId es ignorado al resolver el schema (fijo NEURA_CLIENT_SCHEMA).
    const sb = await getChatServiceClientForEmpresa("__campaign_pump__");

    const { data, error } = await sb
      .from("chat_campaigns")
      .select("id, empresa_id")
      .eq("status", "sending")
      .limit(50);

    if (error || !data?.length) return;

    for (const c of data as Array<{ id: string; empresa_id: string }>) {
      try {
        const r = await runCampaignProcessOnce({
          supabase: sb as unknown as SupabaseAdmin,
          empresaId: c.empresa_id,
          campaignId: c.id,
          batchSize: BATCH,
        });
        if (r.processed > 0 || r.campaignCompleted) {
          console.info(LOG, "lote", {
            campaignId: c.id,
            processed: r.processed,
            remainingQueued: r.remainingQueued,
            completed: r.campaignCompleted,
          });
        }
      } catch (e) {
        console.error(LOG, "error procesando campaña", c.id, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error(LOG, "tick error", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}
