"use server";

import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type {
  MercAsignacion,
  MercProducto,
  MercRendicion,
  MercStockVendedor,
  MercVendedor,
  MercVenta,
  MercVentaItem,
} from "./types";

const LOG = "[mercaderia][queries]";

function logErr(where: string, err: unknown, extra: Record<string, unknown> = {}) {
  const msg = err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
  console.error(LOG, { where, msg, ...extra });
}

async function ctx() {
  const auth = await getUserAndEmpresa(null);
  if (!auth?.empresa_id) return null;
  const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
  return { empresa_id: auth.empresa_id, user_id: auth.user.id, schema };
}

function requirePool() {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Falta SUPABASE_DB_URL/DIRECT_URL para consultar Postgres directo.");
  return pool;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getMercVendedorForCurrentUser(): Promise<MercVendedor | null> {
  const c = await ctx();
  if (!c) return null;
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_vendedores");
    const r = await pool.query<{
      id: string;
      user_id: string | null;
      nombre: string;
      zona: string | null;
      activo: boolean;
      notas: string | null;
    }>(
      `select id, user_id, nombre, zona, activo, notas
         from ${t}
        where empresa_id = $1::uuid and user_id = $2::uuid
        limit 1`,
      [c.empresa_id, c.user_id]
    );
    return r.rows[0] ?? null;
  } catch (e) {
    logErr("getMercVendedorForCurrentUser", e, { empresa_id: c.empresa_id, schema: c.schema });
    return null;
  }
}

export async function listProductos(soloActivos = true): Promise<MercProducto[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_productos");
    const where = soloActivos ? "and activo = true" : "";
    const r = await pool.query(
      `select id, nombre, costo_unitario, precio_unitario, comision_unitaria,
              precio_mayorista_6, comision_mayorista_6, precio_mayorista_12, comision_mayorista_12,
              tiene_mayorista, activo, orden
         from ${t}
        where empresa_id = $1::uuid ${where}
        order by orden asc`,
      [c.empresa_id]
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      nombre: String(row.nombre),
      costo_unitario: num(row.costo_unitario),
      precio_unitario: num(row.precio_unitario),
      comision_unitaria: num(row.comision_unitaria),
      precio_mayorista_6: num(row.precio_mayorista_6),
      comision_mayorista_6: num(row.comision_mayorista_6),
      precio_mayorista_12: num(row.precio_mayorista_12),
      comision_mayorista_12: num(row.comision_mayorista_12),
      tiene_mayorista: !!row.tiene_mayorista,
      activo: !!row.activo,
      orden: num(row.orden),
    }));
  } catch (e) {
    logErr("listProductos", e, { schema: c.schema });
    return [];
  }
}

export async function listVendedores(soloActivos = true): Promise<MercVendedor[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_vendedores");
    const where = soloActivos ? "and activo = true" : "";
    const r = await pool.query(
      `select id, user_id, nombre, zona, activo, notas
         from ${t}
        where empresa_id = $1::uuid ${where}
        order by nombre asc`,
      [c.empresa_id]
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      user_id: row.user_id ? String(row.user_id) : null,
      nombre: String(row.nombre),
      zona: row.zona ?? null,
      activo: !!row.activo,
      notas: row.notas ?? null,
    }));
  } catch (e) {
    logErr("listVendedores", e, { schema: c.schema });
    return [];
  }
}

export async function listStockPorVendedor(vendedorId?: string | null): Promise<MercStockVendedor[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const v = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_stock_vendedor_v");
    const filtro = vendedorId ? "and vendedor_id = $2::uuid" : "";
    const params: unknown[] = [c.empresa_id];
    if (vendedorId) params.push(vendedorId);
    const r = await pool.query(
      `select vendedor_id, vendedor_nombre, producto_id, producto_nombre, stock
         from ${v}
        where empresa_id = $1::uuid ${filtro}
        order by vendedor_nombre asc, producto_nombre asc`,
      params
    );
    return r.rows.map((row) => ({
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: String(row.vendedor_nombre ?? ""),
      producto_id: String(row.producto_id),
      producto_nombre: String(row.producto_nombre ?? ""),
      stock: num(row.stock),
    }));
  } catch (e) {
    logErr("listStockPorVendedor", e, { vendedorId, schema: c.schema });
    return [];
  }
}

export async function listAsignaciones(
  filtros: { vendedorId?: string | null; desde?: string | null; hasta?: string | null; limit?: number } = {}
): Promise<MercAsignacion[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tA = quoteSchemaTable(schema, "merc_asignaciones");
    const tV = quoteSchemaTable(schema, "merc_vendedores");
    const tP = quoteSchemaTable(schema, "merc_productos");
    const conds: string[] = ["a.empresa_id = $1::uuid"];
    const params: unknown[] = [c.empresa_id];
    if (filtros.vendedorId) {
      params.push(filtros.vendedorId);
      conds.push(`a.vendedor_id = $${params.length}::uuid`);
    }
    if (filtros.desde) {
      params.push(filtros.desde);
      conds.push(`a.created_at >= $${params.length}::timestamptz`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta);
      conds.push(`a.created_at <= $${params.length}::timestamptz`);
    }
    const limit = Math.min(500, Math.max(1, filtros.limit ?? 200));
    params.push(limit);
    const r = await pool.query(
      `select a.id, a.vendedor_id, a.producto_id, a.cantidad, a.costo_unitario_snapshot,
              a.notas, a.creado_por, a.created_at,
              v.nombre as vendedor_nombre, p.nombre as producto_nombre
         from ${tA} a
         left join ${tV} v on v.id = a.vendedor_id
         left join ${tP} p on p.id = a.producto_id
        where ${conds.join(" and ")}
        order by a.created_at desc
        limit $${params.length}::int`,
      params
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: row.vendedor_nombre ?? undefined,
      producto_id: String(row.producto_id),
      producto_nombre: row.producto_nombre ?? undefined,
      cantidad: num(row.cantidad),
      costo_unitario_snapshot: num(row.costo_unitario_snapshot),
      notas: row.notas ?? null,
      creado_por: row.creado_por ? String(row.creado_por) : null,
      created_at: String(row.created_at),
    }));
  } catch (e) {
    logErr("listAsignaciones", e, { schema: c.schema });
    return [];
  }
}

export async function listVentas(
  filtros: {
    vendedorId?: string | null;
    desde?: string | null;
    hasta?: string | null;
    tipo?: "simple" | "combo" | null;
    /** Por default excluye anuladas. "solo_anuladas" o "incluir" para verlas. */
    anuladas?: "excluir" | "solo_anuladas" | "incluir";
    limit?: number;
  } = {}
): Promise<MercVenta[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tV = quoteSchemaTable(schema, "merc_ventas");
    const tVend = quoteSchemaTable(schema, "merc_vendedores");
    const conds: string[] = ["v.empresa_id = $1::uuid"];
    const params: unknown[] = [c.empresa_id];
    if (filtros.vendedorId) {
      params.push(filtros.vendedorId);
      conds.push(`v.vendedor_id = $${params.length}::uuid`);
    }
    if (filtros.desde) {
      params.push(filtros.desde);
      conds.push(`v.fecha >= $${params.length}::date`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta);
      conds.push(`v.fecha <= $${params.length}::date`);
    }
    if (filtros.tipo) {
      params.push(filtros.tipo);
      conds.push(`v.tipo = $${params.length}::text`);
    }
    const modoAnul = filtros.anuladas ?? "excluir";
    if (modoAnul === "excluir") conds.push("v.anulada = false");
    else if (modoAnul === "solo_anuladas") conds.push("v.anulada = true");
    const limit = Math.min(500, Math.max(1, filtros.limit ?? 200));
    params.push(limit);
    const r = await pool.query(
      `select v.id, v.vendedor_id, v.fecha, v.tipo, v.monto_total_real,
              v.costo_total_snapshot, v.comision_total_snapshot, v.utilidad_snapshot,
              v.notas, v.anulada, v.anulada_at, v.motivo_anulacion, v.created_at,
              vend.nombre as vendedor_nombre
         from ${tV} v
         left join ${tVend} vend on vend.id = v.vendedor_id
        where ${conds.join(" and ")}
        order by v.fecha desc, v.created_at desc
        limit $${params.length}::int`,
      params
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: row.vendedor_nombre ?? undefined,
      fecha: String(row.fecha).slice(0, 10),
      tipo: row.tipo === "combo" ? "combo" : "simple",
      monto_total_real: num(row.monto_total_real),
      costo_total_snapshot: num(row.costo_total_snapshot),
      comision_total_snapshot: num(row.comision_total_snapshot),
      utilidad_snapshot: num(row.utilidad_snapshot),
      notas: row.notas ?? null,
      anulada: !!row.anulada,
      anulada_at: row.anulada_at ? String(row.anulada_at) : null,
      motivo_anulacion: row.motivo_anulacion ?? null,
      created_at: String(row.created_at),
    }));
  } catch (e) {
    logErr("listVentas", e, { schema: c.schema });
    return [];
  }
}

export async function getVentaConItems(
  ventaId: string
): Promise<{ venta: MercVenta; items: MercVentaItem[] } | null> {
  const c = await ctx();
  if (!c) return null;
  try {
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tV = quoteSchemaTable(schema, "merc_ventas");
    const tVend = quoteSchemaTable(schema, "merc_vendedores");
    const tI = quoteSchemaTable(schema, "merc_ventas_items");
    const tP = quoteSchemaTable(schema, "merc_productos");
    const rv = await pool.query(
      `select v.id, v.vendedor_id, v.fecha, v.tipo, v.monto_total_real,
              v.costo_total_snapshot, v.comision_total_snapshot, v.utilidad_snapshot,
              v.notas, v.anulada, v.anulada_at, v.motivo_anulacion, v.created_at,
              vend.nombre as vendedor_nombre
         from ${tV} v
         left join ${tVend} vend on vend.id = v.vendedor_id
        where v.empresa_id = $1::uuid and v.id = $2::uuid`,
      [c.empresa_id, ventaId]
    );
    if (rv.rowCount === 0) return null;
    const row = rv.rows[0];
    const venta: MercVenta = {
      id: String(row.id),
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: row.vendedor_nombre ?? undefined,
      fecha: String(row.fecha).slice(0, 10),
      tipo: row.tipo === "combo" ? "combo" : "simple",
      monto_total_real: num(row.monto_total_real),
      costo_total_snapshot: num(row.costo_total_snapshot),
      comision_total_snapshot: num(row.comision_total_snapshot),
      utilidad_snapshot: num(row.utilidad_snapshot),
      notas: row.notas ?? null,
      anulada: !!row.anulada,
      anulada_at: row.anulada_at ? String(row.anulada_at) : null,
      motivo_anulacion: row.motivo_anulacion ?? null,
      created_at: String(row.created_at),
    };
    const ri = await pool.query(
      `select i.id, i.venta_id, i.producto_id, i.cantidad,
              i.costo_unitario_snapshot, i.comision_unitaria_snapshot, i.escala_aplicada,
              p.nombre as producto_nombre
         from ${tI} i
         left join ${tP} p on p.id = i.producto_id
        where i.empresa_id = $1::uuid and i.venta_id = $2::uuid`,
      [c.empresa_id, ventaId]
    );
    const items = ri.rows.map((it) => ({
      id: String(it.id),
      venta_id: String(it.venta_id),
      producto_id: String(it.producto_id),
      producto_nombre: it.producto_nombre ?? undefined,
      cantidad: num(it.cantidad),
      costo_unitario_snapshot: num(it.costo_unitario_snapshot),
      comision_unitaria_snapshot: num(it.comision_unitaria_snapshot),
      escala_aplicada:
        it.escala_aplicada === "mayorista_12" || it.escala_aplicada === "mayorista_6"
          ? it.escala_aplicada
          : "unitario",
    })) as MercVentaItem[];
    return { venta, items };
  } catch (e) {
    logErr("getVentaConItems", e, { ventaId, schema: c.schema });
    return null;
  }
}

export async function listRendiciones(
  filtros: { vendedorId?: string | null; desde?: string | null; hasta?: string | null; limit?: number } = {}
): Promise<MercRendicion[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tR = quoteSchemaTable(schema, "merc_rendiciones");
    const tV = quoteSchemaTable(schema, "merc_vendedores");
    const conds: string[] = ["r.empresa_id = $1::uuid"];
    const params: unknown[] = [c.empresa_id];
    if (filtros.vendedorId) {
      params.push(filtros.vendedorId);
      conds.push(`r.vendedor_id = $${params.length}::uuid`);
    }
    if (filtros.desde) {
      params.push(filtros.desde);
      conds.push(`r.fecha >= $${params.length}::date`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta);
      conds.push(`r.fecha <= $${params.length}::date`);
    }
    const limit = Math.min(500, Math.max(1, filtros.limit ?? 200));
    params.push(limit);
    const q = await pool.query(
      `select r.id, r.vendedor_id, r.fecha, r.monto_rendido, r.comision_pagada,
              r.notas, r.created_at, v.nombre as vendedor_nombre
         from ${tR} r
         left join ${tV} v on v.id = r.vendedor_id
        where ${conds.join(" and ")}
        order by r.fecha desc, r.created_at desc
        limit $${params.length}::int`,
      params
    );
    return q.rows.map((row) => ({
      id: String(row.id),
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: row.vendedor_nombre ?? undefined,
      fecha: String(row.fecha).slice(0, 10),
      monto_rendido: num(row.monto_rendido),
      comision_pagada: num(row.comision_pagada),
      notas: row.notas ?? null,
      created_at: String(row.created_at),
    }));
  } catch (e) {
    logErr("listRendiciones", e, { schema: c.schema });
    return [];
  }
}

export type MercKpiRow = {
  vendedor_id: string;
  vendedor_nombre: string;
  ventas_cantidad: number;
  monto_total: number;
  comision_total: number;
  utilidad_total: number;
};

export async function getKpisPorVendedor(desde: string, hasta: string): Promise<MercKpiRow[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tV = quoteSchemaTable(schema, "merc_ventas");
    const tVend = quoteSchemaTable(schema, "merc_vendedores");
    const r = await pool.query(
      `select v.vendedor_id as vendedor_id,
              coalesce(vend.nombre, '') as vendedor_nombre,
              count(v.id)::int as ventas_cantidad,
              coalesce(sum(v.monto_total_real), 0) as monto_total,
              coalesce(sum(v.comision_total_snapshot), 0) as comision_total,
              coalesce(sum(v.utilidad_snapshot), 0) as utilidad_total
         from ${tV} v
         left join ${tVend} vend on vend.id = v.vendedor_id
        where v.empresa_id = $1::uuid
          and v.anulada = false
          and v.fecha >= $2::date and v.fecha <= $3::date
        group by v.vendedor_id, vend.nombre
        order by vendedor_nombre asc`,
      [c.empresa_id, desde, hasta]
    );
    return r.rows.map((row) => ({
      vendedor_id: String(row.vendedor_id),
      vendedor_nombre: String(row.vendedor_nombre ?? ""),
      ventas_cantidad: num(row.ventas_cantidad),
      monto_total: num(row.monto_total),
      comision_total: num(row.comision_total),
      utilidad_total: num(row.utilidad_total),
    }));
  } catch (e) {
    logErr("getKpisPorVendedor", e, { desde, hasta, schema: c.schema });
    return [];
  }
}
