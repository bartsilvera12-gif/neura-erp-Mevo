"use server";

import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Ventas por día de un sorteo, agrupadas por calendario Asuncion (UTC-4).
 * Devuelve una fila por día en el rango [hoy - dias + 1, hoy], incluidos los días sin ventas
 * (con ceros) para que el gráfico muestre huecos como huecos y no como columnas juntas.
 *
 * Se distinguen dos estados: 'confirmado' vs 'pendiente_revision'. Los rechazados no cuentan.
 */

export type VentasPorDiaRow = {
  fecha: string; // YYYY-MM-DD en Asuncion
  boletas_confirmadas: number;
  boletas_pendientes: number;
  monto_confirmado: number;
  monto_pendiente: number;
};

const LOG_ERR = "[sorteos][ventas-por-dia][error]";

function asuncionYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}

/** Construye la ventana [start, end] cubriendo los últimos `dias` días calendario Asuncion. */
function windowUtc(dias: number): { start: string; end: string; ymds: string[] } {
  const now = new Date();
  const todayYmd = asuncionYmd(now);
  const [ty, tm, td] = todayYmd.split("-").map((n) => Number(n));
  const ymds: string[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1, td - i));
    // Interpretamos ese día como Asuncion (UTC-4):
    const ymdAsuncion = d.toISOString().slice(0, 10);
    ymds.push(ymdAsuncion);
  }
  const startYmd = ymds[0];
  const endYmd = ymds[ymds.length - 1];
  const start = new Date(`${startYmd}T00:00:00-04:00`).toISOString();
  const end = new Date(`${endYmd}T23:59:59.999-04:00`).toISOString();
  return { start, end, ymds };
}

function emptySeries(ymds: string[]): VentasPorDiaRow[] {
  return ymds.map((fecha) => ({
    fecha,
    boletas_confirmadas: 0,
    boletas_pendientes: 0,
    monto_confirmado: 0,
    monto_pendiente: 0,
  }));
}

async function fetchFromPg(
  empresaId: string,
  schema: string,
  sorteoId: string,
  win: { start: string; end: string; ymds: string[] }
): Promise<VentasPorDiaRow[]> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("no_pg_pool");
  const sch = assertAllowedChatDataSchema(schema);
  const tent = quoteSchemaTable(sch, "sorteo_entradas");
  const tcup = quoteSchemaTable(sch, "sorteo_cupones");

  const [bRes, mRes] = await Promise.all([
    pool.query<{
      fecha: string;
      estado_pago: string | null;
      n: string;
    }>(
      `SELECT to_char((e.created_at AT TIME ZONE 'America/Asuncion')::date, 'YYYY-MM-DD') AS fecha,
              e.estado_pago,
              COUNT(c.id)::text AS n
         FROM ${tcup} c
         INNER JOIN ${tent} e ON e.id = c.entrada_id
        WHERE e.empresa_id = $1::uuid
          AND e.sorteo_id = $2::uuid
          AND e.estado_pago <> 'rechazado'
          AND e.created_at >= $3::timestamptz
          AND e.created_at <= $4::timestamptz
        GROUP BY 1, 2`,
      [empresaId, sorteoId, win.start, win.end]
    ),
    pool.query<{
      fecha: string;
      estado_pago: string | null;
      n: string;
    }>(
      `SELECT to_char((e.created_at AT TIME ZONE 'America/Asuncion')::date, 'YYYY-MM-DD') AS fecha,
              e.estado_pago,
              COALESCE(SUM(e.monto_total), 0)::text AS n
         FROM ${tent} e
        WHERE e.empresa_id = $1::uuid
          AND e.sorteo_id = $2::uuid
          AND e.estado_pago <> 'rechazado'
          AND e.created_at >= $3::timestamptz
          AND e.created_at <= $4::timestamptz
        GROUP BY 1, 2`,
      [empresaId, sorteoId, win.start, win.end]
    ),
  ]);

  const base = emptySeries(win.ymds);
  const byDate = new Map(base.map((r) => [r.fecha, r]));

  for (const r of bRes.rows) {
    const row = byDate.get(r.fecha);
    if (!row) continue;
    const n = Number(r.n) || 0;
    if ((r.estado_pago ?? "").trim() === "confirmado") row.boletas_confirmadas += n;
    else row.boletas_pendientes += n;
  }
  for (const r of mRes.rows) {
    const row = byDate.get(r.fecha);
    if (!row) continue;
    const n = Number(r.n) || 0;
    if ((r.estado_pago ?? "").trim() === "confirmado") row.monto_confirmado += n;
    else row.monto_pendiente += n;
  }
  return base;
}

async function fetchFromPostgrest(
  empresaId: string,
  sorteoId: string,
  win: { start: string; end: string; ymds: string[] }
): Promise<VentasPorDiaRow[]> {
  const supabase = await getChatServiceClientForEmpresa(empresaId);
  const res = await supabase
    .from("sorteo_entradas")
    .select("cantidad_boletos, monto_total, estado_pago, created_at")
    .eq("empresa_id", empresaId)
    .eq("sorteo_id", sorteoId)
    .neq("estado_pago", "rechazado")
    .gte("created_at", win.start)
    .lte("created_at", win.end);
  if (res.error) throw res.error;

  const base = emptySeries(win.ymds);
  const byDate = new Map(base.map((r) => [r.fecha, r]));

  for (const r of (res.data ?? []) as Array<{
    cantidad_boletos?: number | null;
    monto_total?: number | string | null;
    estado_pago?: string | null;
    created_at?: string | null;
  }>) {
    if (!r.created_at) continue;
    const fecha = new Date(r.created_at).toLocaleDateString("en-CA", {
      timeZone: "America/Asuncion",
    });
    const row = byDate.get(fecha);
    if (!row) continue;
    const boletas = Number(r.cantidad_boletos) || 0;
    const monto = Number(r.monto_total) || 0;
    if ((r.estado_pago ?? "").trim() === "confirmado") {
      row.boletas_confirmadas += boletas;
      row.monto_confirmado += monto;
    } else {
      row.boletas_pendientes += boletas;
      row.monto_pendiente += monto;
    }
  }
  return base;
}

/**
 * KPIs de ventas por día para el sorteo dado, últimos `dias` días (default 14).
 * Devuelve array vacío si no hay sesión o error de acceso; nunca lanza.
 */
export async function getSorteoVentasPorDia(
  sorteoId: string,
  dias = 14
): Promise<VentasPorDiaRow[]> {
  const auth = await getUserAndEmpresa(null);
  if (!auth?.empresa_id) return [];
  const empresaId = auth.empresa_id;
  const n = Math.max(1, Math.min(90, Math.trunc(dias) || 14));
  const win = windowUtc(n);
  const schema = await fetchDataSchemaForEmpresaId(empresaId);
  try {
    if (getChatPostgresPool()) {
      return await fetchFromPg(empresaId, schema, sorteoId, win);
    }
  } catch (e) {
    console.error(LOG_ERR, {
      empresa_id: empresaId,
      schema,
      sorteo_id: sorteoId,
      source: "pg",
      msg: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    });
  }
  try {
    return await fetchFromPostgrest(empresaId, sorteoId, win);
  } catch (e) {
    console.error(LOG_ERR, {
      empresa_id: empresaId,
      schema,
      sorteo_id: sorteoId,
      source: "postgrest",
      msg: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    });
    return emptySeries(win.ymds);
  }
}
