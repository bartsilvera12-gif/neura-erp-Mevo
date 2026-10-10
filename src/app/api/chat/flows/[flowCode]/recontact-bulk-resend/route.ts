import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { createFlowEngine } from "@/lib/chat/flow-engine-service";
import { isSorteoFinalTicketNode } from "@/lib/chat/sorteo-final-ticket-node";
import { isNodeActiveInFlow } from "@/lib/chat/resolve-whatsapp-active-flow";

/**
 * POST /api/chat/conversations ... /flows/:flowCode/recontact-bulk-resend
 *
 * Reenvío MASIVO del paso actual (mismo mecanismo que el botón "Reenviar paso"),
 * a las conversaciones que quedaron detenidas en un flujo (p. ej. el corte de Meta).
 *
 * REGLA DE SANGRE — acotado y sin procesos colgados:
 *  - UNA sola pasada sobre un conjunto FIJO (sin cron, sin setInterval, sin recursión).
 *  - Tope duro de conversaciones (limit, máx 1000) + delay entre envíos + timeout de corrida.
 *  - Idempotente: marca un chat_flow_events por reenvío; re-ejecutar NO duplica (continúa).
 *  - Guardas iguales a "Reenviar paso": salta humano/cerradas/sesión completada/nodo final/nodo inexistente.
 *  - Por defecto DRY-RUN (execute=false): solo cuenta candidatos, no envía nada.
 */

const MARKER_DEFAULT = "recontact_bulk_resend";
const DEFAULT_NODES = [
  "mayor_edad", "no_mayor_edad", "primer_nombre", "primer_apellido",
  "cedula", "combos_populares", "pedido_de_comprobante", "confirmacion_de_compra",
];

const clamp = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ flowCode: string }> }
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }

    const { flowCode: rawFlow } = await context.params;
    const flowCode = (rawFlow ?? "").trim();
    if (!flowCode) {
      return NextResponse.json({ ok: false, error: "Falta flowCode" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      execute?: boolean;
      idle_minutes?: number;
      included_nodes?: string[];
      limit?: number;
      delay_ms?: number;
      max_runtime_ms?: number;
      marker?: string;
    };

    const execute = body.execute === true;
    const idleMinutes = clamp(body.idle_minutes, 30, 1, 10080);
    const limit = clamp(body.limit, 500, 1, 1000);
    const delayMs = clamp(body.delay_ms, 500, 150, 3000);
    const maxRuntimeMs = clamp(body.max_runtime_ms, 240000, 10000, 280000);
    const marker = (body.marker ?? MARKER_DEFAULT).trim() || MARKER_DEFAULT;
    const includedNodes = Array.isArray(body.included_nodes) && body.included_nodes.length
      ? body.included_nodes.map((x) => String(x))
      : DEFAULT_NODES;

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const cutoffIso = new Date(Date.now() - idleMinutes * 60_000).toISOString();

    // Candidatos: detenidos en el flujo, modo bot, sin humano, abiertos, con sesión e inactivos.
    const { data: convRows, error: convErr } = await supabase
      .from("chat_conversations")
      .select("id, flow_code, flow_current_node, flow_status, human_taken_over, active_flow_session_id, status, last_message_at")
      .eq("empresa_id", auth.empresa_id)
      .eq("flow_code", flowCode)
      .eq("flow_status", "bot")
      .eq("human_taken_over", false)
      .neq("status", "closed")
      .not("active_flow_session_id", "is", null)
      .in("flow_current_node", includedNodes)
      .lte("last_message_at", cutoffIso)
      .order("last_message_at", { ascending: true })
      .limit(limit);

    if (convErr) {
      return NextResponse.json({ ok: false, error: convErr.message }, { status: 400 });
    }
    const candidates = (convRows ?? []) as Array<{
      id: string; flow_current_node: string | null; active_flow_session_id: string | null;
    }>;

    // Idempotencia: excluir los ya re-contactados por esta marca (en lotes).
    const alreadyDone = new Set<string>();
    const ids = candidates.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data: ev } = await supabase
        .from("chat_flow_events")
        .select("conversation_id")
        .eq("empresa_id", auth.empresa_id)
        .eq("event_type", marker)
        .in("conversation_id", chunk);
      for (const e of ev ?? []) alreadyDone.add(String((e as { conversation_id?: string }).conversation_id ?? ""));
    }
    const pending = candidates.filter((c) => !alreadyDone.has(c.id));

    if (!execute) {
      const byNode: Record<string, number> = {};
      for (const c of pending) byNode[c.flow_current_node ?? "?"] = (byNode[c.flow_current_node ?? "?"] ?? 0) + 1;
      return NextResponse.json({
        ok: true, dry_run: true, flow_code: flowCode,
        candidatos_total: candidates.length, ya_reenviados: alreadyDone.size,
        a_enviar: pending.length, por_paso: byNode,
        nota: "Dry-run: no se envió nada. Repetir con execute=true para disparar.",
      });
    }

    const engine = createFlowEngine({ supabase });
    const startedAt = Date.now();
    let sent = 0, skipped = 0, failed = 0, processed = 0;
    const errors: Array<{ conversation_id: string; error: string }> = [];

    for (const c of pending) {
      if (Date.now() - startedAt > maxRuntimeMs) break; // corte por tiempo → el resto queda para otra corrida
      processed++;
      const cid = c.id;
      try {
        // Re-validar en vivo (el estado pudo cambiar).
        const { data: fresh } = await supabase
          .from("chat_conversations")
          .select("flow_code, flow_current_node, flow_status, human_taken_over, active_flow_session_id, status")
          .eq("id", cid).eq("empresa_id", auth.empresa_id).maybeSingle();
        if (!fresh) { skipped++; continue; }
        const f = fresh as Record<string, unknown>;
        const node = String(f.flow_current_node ?? "").trim();
        const fCode = String(f.flow_code ?? "").trim();
        const sessionId = String(f.active_flow_session_id ?? "").trim();
        if (
          f.flow_status !== "bot" || f.human_taken_over === true || f.status === "closed" ||
          !node || !fCode || !sessionId || isSorteoFinalTicketNode(node)
        ) { skipped++; continue; }

        // sesión completada → no reenviar confirmación vieja
        const { data: sess } = await supabase
          .from("chat_flow_sessions").select("status").eq("id", sessionId).eq("empresa_id", auth.empresa_id).maybeSingle();
        if (String((sess as { status?: string } | null)?.status ?? "").toLowerCase() === "completed") { skipped++; continue; }

        if (!(await isNodeActiveInFlow(supabase, auth.empresa_id, fCode, node))) { skipped++; continue; }

        // idempotencia (doble chequeo por si corrió en paralelo)
        const { data: ev2 } = await supabase
          .from("chat_flow_events").select("id")
          .eq("empresa_id", auth.empresa_id).eq("event_type", marker).eq("conversation_id", cid).limit(1);
        if (ev2 && ev2.length) { skipped++; continue; }

        const r = await engine.sendCurrentFlowNode({ conversationId: cid });
        if (r.ok) {
          sent++;
          await supabase.from("chat_flow_events").insert({
            empresa_id: auth.empresa_id, conversation_id: cid, flow_code: fCode,
            node_code: r.nodeCode ?? node, flow_session_id: sessionId || null,
            event_type: marker,
            payload: { source: "recontact_bulk_resend", operator_user_id: auth.user.id, at: new Date().toISOString() },
          });
          await sleep(delayMs);
        } else {
          failed++;
          if (errors.length < 20) errors.push({ conversation_id: cid, error: (r.error ?? "send_failed").slice(0, 160) });
        }
      } catch (e) {
        failed++;
        if (errors.length < 20) errors.push({ conversation_id: cid, error: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
      }
    }

    const remaining = pending.length - processed;
    return NextResponse.json({
      ok: true, dry_run: false, flow_code: flowCode,
      enviados: sent, salteados: skipped, errores: failed,
      procesados: processed, restantes: Math.max(0, remaining),
      done: remaining <= 0,
      nota: remaining > 0
        ? "Se cortó por tope de tiempo; volvé a ejecutar para continuar con los restantes (es idempotente)."
        : "Terminó. Re-ejecutar no duplica (idempotente).",
      errores_muestra: errors,
    });
  } catch (e) {
    console.error("[recontact-bulk-resend]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
