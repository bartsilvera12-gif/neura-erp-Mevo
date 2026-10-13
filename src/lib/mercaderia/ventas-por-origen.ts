import "server-only";

import {
  getChatPostgresPool,
  getChatPostgresConnectionString,
  quoteSchemaTable,
} from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getEmpresaIdForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import { esPublicidad, origenLabel, type MercOrigenValue } from "@/lib/mercaderia/origen";

/**
 * Reporte: ventas de mercadería por vendedor y por origen (publicidad vs
 * habitual/local), para comparar lo que se vende gracias a la publicidad.
 */

export type OrigenVendedorRow = {
  vendedor_id: string;
  vendedor: string;
  porOrigen: Record<string, number>; // value de origen (o 'sin') -> monto
  publicidad: number;
  habitual: number;
  total: number;
  ventas: number;
};

export type VentasPorOrigenResult = {
  rows: OrigenVendedorRow[];
  totalPublicidad: number;
  totalHabitual: number;
  totalGeneral: number;
  totalVentas: number;
  error: string | null;
};

const SIN = "sin";

export function origenColLabel(key: string): string {
  return key === SIN ? "Sin especificar" : origenLabel(key);
}

export async function fetchVentasPorOrigen(opts: {
  desde?: string | null;
  hasta?: string | null;
}): Promise<VentasPorOrigenResult> {
  const base: VentasPorOrigenResult = {
    rows: [],
    totalPublicidad: 0,
    totalHabitual: 0,
    totalGeneral: 0,
    totalVentas: 0,
    error: null,
  };
  const empresaId = await getEmpresaIdForCurrentUserServer();
  if (!empresaId) return { ...base, error: "Sin sesión o empresa." };
  if (!getChatPostgresConnectionString()) return { ...base, error: "Sin conexión directa a la base." };
  const pool = getChatPostgresPool();
  if (!pool) return { ...base, error: "Pool de base de datos no disponible." };

  const sch = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const tV = quoteSchemaTable(sch, "merc_ventas");
  const tVend = quoteSchemaTable(sch, "merc_vendedores");

  const desde = opts.desde && /^\d{4}-\d{2}-\d{2}$/.test(opts.desde) ? opts.desde : null;
  const hasta = opts.hasta && /^\d{4}-\d{2}-\d{2}$/.test(opts.hasta) ? opts.hasta : null;

  const params: unknown[] = [empresaId];
  let fechaCond = "";
  if (desde) {
    params.push(desde);
    fechaCond += ` AND ve.fecha >= $${params.length}::date`;
  }
  if (hasta) {
    params.push(hasta);
    fechaCond += ` AND ve.fecha <= $${params.length}::date`;
  }

  const sql = `
    SELECT v.id AS vendedor_id, v.nombre AS vendedor,
           COALESCE(ve.origen, '${SIN}') AS origen,
           SUM(ve.monto_total_real)::bigint AS monto,
           count(*)::int AS ventas
    FROM ${tV} ve
    JOIN ${tVend} v ON v.id = ve.vendedor_id AND v.empresa_id = ve.empresa_id
    WHERE ve.empresa_id = $1::uuid AND ve.anulada IS NOT TRUE ${fechaCond}
    GROUP BY v.id, v.nombre, COALESCE(ve.origen, '${SIN}')
  `;

  try {
    const res = await pool.query(sql, params);
    const byVend = new Map<string, OrigenVendedorRow>();
    for (const r of res.rows as {
      vendedor_id: string;
      vendedor: string;
      origen: string;
      monto: string | number;
      ventas: number;
    }[]) {
      const id = String(r.vendedor_id);
      let row = byVend.get(id);
      if (!row) {
        row = {
          vendedor_id: id,
          vendedor: String(r.vendedor ?? ""),
          porOrigen: {},
          publicidad: 0,
          habitual: 0,
          total: 0,
          ventas: 0,
        };
        byVend.set(id, row);
      }
      const monto = Number(r.monto) || 0;
      const origen = String(r.origen);
      row.porOrigen[origen] = (row.porOrigen[origen] ?? 0) + monto;
      row.total += monto;
      row.ventas += Number(r.ventas) || 0;
      if (esPublicidad(origen as MercOrigenValue)) row.publicidad += monto;
      else row.habitual += monto;
    }

    const rows = [...byVend.values()].sort((a, b) => b.total - a.total);
    const totalPublicidad = rows.reduce((s, r) => s + r.publicidad, 0);
    const totalHabitual = rows.reduce((s, r) => s + r.habitual, 0);
    const totalGeneral = rows.reduce((s, r) => s + r.total, 0);
    const totalVentas = rows.reduce((s, r) => s + r.ventas, 0);

    return { rows, totalPublicidad, totalHabitual, totalGeneral, totalVentas, error: null };
  } catch (e) {
    console.error("[mercaderia][ventas-por-origen]", e instanceof Error ? e.message.slice(0, 300) : e);
    return { ...base, error: "No se pudo generar el reporte. Intentá de nuevo." };
  }
}
