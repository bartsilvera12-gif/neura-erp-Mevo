import "server-only";

import {
  getChatPostgresPool,
  getChatPostgresConnectionString,
  quoteSchemaTable,
} from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getEmpresaIdForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import {
  asuncionDateStartUtc,
  asuncionDateEndExclusiveUtc,
  asuncionMonthBoundsUtc,
} from "@/lib/sorteos/kpis-time-bounds";

/** Comisión del vendedor por boleta de sorteo: 20% del monto vendido. */
export const COMISION_BOLETA_PCT = 0.2;

export type BoletaVendedorRow = {
  entrada_id: string;
  numero_orden: number;
  fecha: string;
  sorteo_nombre: string;
  nombre_participante: string;
  cantidad_boletos: number;
  monto: number;
  comision: number;
};

export type ComisionesVendedorResult = {
  rows: BoletaVendedorRow[];
  rangoMonto: number;
  rangoComision: number;
  totalAcumuladoMonto: number;
  totalAcumuladoComision: number;
  mesMonto: number;
  mesComision: number;
  error: string | null;
};

function emptyResult(error: string | null): ComisionesVendedorResult {
  return {
    rows: [],
    rangoMonto: 0,
    rangoComision: 0,
    totalAcumuladoMonto: 0,
    totalAcumuladoComision: 0,
    mesMonto: 0,
    mesComision: 0,
    error,
  };
}

const pct = (monto: number) => Math.round((Number(monto) || 0) * COMISION_BOLETA_PCT);

/**
 * Boletas de sorteo generadas por un vendedor (atribuidas vía merc_vendedor_id),
 * con su comisión (20%). Devuelve el detalle del rango + acumulado total + mes actual.
 */
export async function fetchComisionesVendedor(opts: {
  vendedorId: string;
  desde?: string | null;
  hasta?: string | null;
}): Promise<ComisionesVendedorResult> {
  const empresaId = await getEmpresaIdForCurrentUserServer();
  if (!empresaId) return emptyResult("Sin sesión o empresa.");
  if (!getChatPostgresConnectionString()) return emptyResult("Sin conexión directa a la base.");
  const pool = getChatPostgresPool();
  if (!pool) return emptyResult("Pool de base de datos no disponible.");
  const vendedorId = opts.vendedorId?.trim();
  if (!vendedorId) return emptyResult("Vendedor no indicado.");

  const sch = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const tEnt = quoteSchemaTable(sch, "sorteo_entradas");
  const tSort = quoteSchemaTable(sch, "sorteos");
  const tCup = quoteSchemaTable(sch, "sorteo_cupones");

  const desdeUtc = opts.desde ? asuncionDateStartUtc(opts.desde) : null;
  const hastaUtc = opts.hasta ? asuncionDateEndExclusiveUtc(opts.hasta) : null;
  const { start: mesStart, end: mesEnd } = asuncionMonthBoundsUtc();

  try {
    const params: unknown[] = [empresaId, vendedorId];
    let fechaCond = "";
    if (desdeUtc) {
      params.push(desdeUtc);
      fechaCond += ` AND se.created_at >= $${params.length}::timestamptz`;
    }
    if (hastaUtc) {
      params.push(hastaUtc);
      fechaCond += ` AND se.created_at < $${params.length}::timestamptz`;
    }

    const detSql = `
      SELECT se.id, se.numero_orden, se.created_at, se.monto_total, se.cantidad_boletos,
             se.nombre_participante, so.nombre AS sorteo_nombre,
             (SELECT count(*) FROM ${tCup} c WHERE c.entrada_id = se.id AND c.empresa_id = se.empresa_id) AS cupones
      FROM ${tEnt} se
      JOIN ${tSort} so ON so.id = se.sorteo_id AND so.empresa_id = se.empresa_id
      WHERE se.empresa_id = $1::uuid AND se.merc_vendedor_id = $2::uuid
        AND se.estado_pago <> 'rechazado' AND se.monto_total > 0 ${fechaCond}
      ORDER BY se.created_at DESC
    `;
    const det = await pool.query(detSql, params);
    const rows: BoletaVendedorRow[] = (det.rows ?? []).map((r) => {
      const monto = Number((r as { monto_total: unknown }).monto_total) || 0;
      const createdAt = (r as { created_at: unknown }).created_at;
      const cupones = Number((r as { cupones?: unknown }).cupones);
      const cant = Number((r as { cantidad_boletos?: unknown }).cantidad_boletos) || 0;
      return {
        entrada_id: String((r as { id: unknown }).id),
        numero_orden: Number((r as { numero_orden?: unknown }).numero_orden) || 0,
        fecha: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ""),
        sorteo_nombre: String((r as { sorteo_nombre?: unknown }).sorteo_nombre ?? ""),
        nombre_participante: String((r as { nombre_participante?: unknown }).nombre_participante ?? ""),
        cantidad_boletos: Number.isFinite(cupones) && cupones > 0 ? cupones : cant,
        monto,
        comision: pct(monto),
      };
    });

    const rangoMonto = rows.reduce((s, r) => s + r.monto, 0);
    const rangoComision = rows.reduce((s, r) => s + r.comision, 0);

    const aggSql = `
      SELECT
        COALESCE(SUM(monto_total), 0)::bigint AS total_monto,
        COALESCE(SUM(monto_total) FILTER (WHERE created_at >= $3::timestamptz AND created_at <= $4::timestamptz), 0)::bigint AS mes_monto
      FROM ${tEnt}
      WHERE empresa_id = $1::uuid AND merc_vendedor_id = $2::uuid
        AND estado_pago <> 'rechazado' AND monto_total > 0
    `;
    const agg = await pool.query(aggSql, [empresaId, vendedorId, mesStart, mesEnd]);
    const a = (agg.rows?.[0] ?? {}) as { total_monto?: unknown; mes_monto?: unknown };
    const totalAcumuladoMonto = Number(a.total_monto) || 0;
    const mesMonto = Number(a.mes_monto) || 0;

    return {
      rows,
      rangoMonto,
      rangoComision,
      totalAcumuladoMonto,
      totalAcumuladoComision: pct(totalAcumuladoMonto),
      mesMonto,
      mesComision: pct(mesMonto),
      error: null,
    };
  } catch (e) {
    console.error("[sorteos][comisiones-vendedor]", {
      empresaId,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e),
    });
    return emptyResult("No se pudo cargar el reporte. Intentá de nuevo en unos segundos.");
  }
}
