"use server";

import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
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

/** Devuelve empresa_id y user_id o null si no hay sesión. */
async function ctx() {
  const auth = await getUserAndEmpresa(null);
  if (!auth?.empresa_id) return null;
  return { empresa_id: auth.empresa_id, user_id: auth.user.id };
}

/** Sesión + rol resuelto. Útil para saber si el usuario logueado es vendedor. */
export async function getMercVendedorForCurrentUser(): Promise<MercVendedor | null> {
  const c = await ctx();
  if (!c) return null;
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const { data, error } = await sb
      .from("merc_vendedores")
      .select("id, user_id, nombre, zona, activo, notas")
      .eq("empresa_id", c.empresa_id)
      .eq("user_id", c.user_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data as MercVendedor;
  } catch (e) {
    logErr("getMercVendedorForCurrentUser", e, { empresa_id: c.empresa_id });
    return null;
  }
}

export async function listProductos(soloActivos = true): Promise<MercProducto[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_productos")
      .select(
        "id, nombre, costo_unitario, precio_unitario, comision_unitaria, precio_mayorista_6, comision_mayorista_6, precio_mayorista_12, comision_mayorista_12, tiene_mayorista, activo, orden"
      )
      .eq("empresa_id", c.empresa_id)
      .order("orden", { ascending: true });
    if (soloActivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MercProducto[];
  } catch (e) {
    logErr("listProductos", e);
    return [];
  }
}

export async function listVendedores(soloActivos = true): Promise<MercVendedor[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_vendedores")
      .select("id, user_id, nombre, zona, activo, notas")
      .eq("empresa_id", c.empresa_id)
      .order("nombre", { ascending: true });
    if (soloActivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MercVendedor[];
  } catch (e) {
    logErr("listVendedores", e);
    return [];
  }
}

export async function listStockPorVendedor(vendedorId?: string | null): Promise<MercStockVendedor[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_stock_vendedor_v")
      .select("vendedor_id, vendedor_nombre, producto_id, producto_nombre, stock")
      .eq("empresa_id", c.empresa_id)
      .order("vendedor_nombre", { ascending: true });
    if (vendedorId) q = q.eq("vendedor_id", vendedorId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MercStockVendedor[];
  } catch (e) {
    logErr("listStockPorVendedor", e, { vendedorId });
    return [];
  }
}

export async function listAsignaciones(
  filtros: { vendedorId?: string | null; desde?: string | null; hasta?: string | null; limit?: number } = {}
): Promise<MercAsignacion[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_asignaciones")
      .select(
        "id, vendedor_id, producto_id, cantidad, costo_unitario_snapshot, notas, creado_por, created_at, merc_vendedores(nombre), merc_productos(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, filtros.limit ?? 200)));
    if (filtros.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId);
    if (filtros.desde) q = q.gte("created_at", filtros.desde);
    if (filtros.hasta) q = q.lte("created_at", filtros.hasta);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        vendedor_id: string;
        producto_id: string;
        cantidad: number;
        costo_unitario_snapshot: number;
        notas: string | null;
        creado_por: string | null;
        created_at: string;
        merc_vendedores?: { nombre?: string } | null;
        merc_productos?: { nombre?: string } | null;
      };
      return {
        id: row.id,
        vendedor_id: row.vendedor_id,
        vendedor_nombre: row.merc_vendedores?.nombre ?? undefined,
        producto_id: row.producto_id,
        producto_nombre: row.merc_productos?.nombre ?? undefined,
        cantidad: row.cantidad,
        costo_unitario_snapshot: row.costo_unitario_snapshot,
        notas: row.notas,
        creado_por: row.creado_por,
        created_at: row.created_at,
      } satisfies MercAsignacion;
    });
  } catch (e) {
    logErr("listAsignaciones", e, filtros);
    return [];
  }
}

export async function listVentas(
  filtros: {
    vendedorId?: string | null;
    desde?: string | null;
    hasta?: string | null;
    tipo?: "simple" | "combo" | null;
    limit?: number;
  } = {}
): Promise<MercVenta[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_ventas")
      .select(
        "id, vendedor_id, fecha, tipo, monto_total_real, costo_total_snapshot, comision_total_snapshot, utilidad_snapshot, notas, created_at, merc_vendedores(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, filtros.limit ?? 200)));
    if (filtros.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId);
    if (filtros.desde) q = q.gte("fecha", filtros.desde);
    if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
    if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        vendedor_id: string;
        fecha: string;
        tipo: "simple" | "combo";
        monto_total_real: number;
        costo_total_snapshot: number;
        comision_total_snapshot: number;
        utilidad_snapshot: number;
        notas: string | null;
        created_at: string;
        merc_vendedores?: { nombre?: string } | null;
      };
      return {
        id: row.id,
        vendedor_id: row.vendedor_id,
        vendedor_nombre: row.merc_vendedores?.nombre ?? undefined,
        fecha: row.fecha,
        tipo: row.tipo,
        monto_total_real: row.monto_total_real,
        costo_total_snapshot: row.costo_total_snapshot,
        comision_total_snapshot: row.comision_total_snapshot,
        utilidad_snapshot: row.utilidad_snapshot,
        notas: row.notas,
        created_at: row.created_at,
      } satisfies MercVenta;
    });
  } catch (e) {
    logErr("listVentas", e, filtros);
    return [];
  }
}

export async function getVentaConItems(
  ventaId: string
): Promise<{ venta: MercVenta; items: MercVentaItem[] } | null> {
  const c = await ctx();
  if (!c) return null;
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const { data: v, error: eV } = await sb
      .from("merc_ventas")
      .select(
        "id, vendedor_id, fecha, tipo, monto_total_real, costo_total_snapshot, comision_total_snapshot, utilidad_snapshot, notas, created_at, merc_vendedores(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .eq("id", ventaId)
      .maybeSingle();
    if (eV) throw eV;
    if (!v) return null;
    const { data: items, error: eI } = await sb
      .from("merc_ventas_items")
      .select(
        "id, venta_id, producto_id, cantidad, costo_unitario_snapshot, comision_unitaria_snapshot, escala_aplicada, merc_productos(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .eq("venta_id", ventaId);
    if (eI) throw eI;
    const vRow = v as unknown as {
      id: string;
      vendedor_id: string;
      fecha: string;
      tipo: "simple" | "combo";
      monto_total_real: number;
      costo_total_snapshot: number;
      comision_total_snapshot: number;
      utilidad_snapshot: number;
      notas: string | null;
      created_at: string;
      merc_vendedores?: { nombre?: string } | null;
    };
    const venta: MercVenta = {
      id: vRow.id,
      vendedor_id: vRow.vendedor_id,
      vendedor_nombre: vRow.merc_vendedores?.nombre ?? undefined,
      fecha: vRow.fecha,
      tipo: vRow.tipo,
      monto_total_real: vRow.monto_total_real,
      costo_total_snapshot: vRow.costo_total_snapshot,
      comision_total_snapshot: vRow.comision_total_snapshot,
      utilidad_snapshot: vRow.utilidad_snapshot,
      notas: vRow.notas,
      created_at: vRow.created_at,
    };
    const mapped: MercVentaItem[] = (items ?? []).map((r) => {
      const it = r as unknown as {
        id: string;
        venta_id: string;
        producto_id: string;
        cantidad: number;
        costo_unitario_snapshot: number;
        comision_unitaria_snapshot: number;
        escala_aplicada: MercVentaItem["escala_aplicada"];
        merc_productos?: { nombre?: string } | null;
      };
      return {
        id: it.id,
        venta_id: it.venta_id,
        producto_id: it.producto_id,
        producto_nombre: it.merc_productos?.nombre ?? undefined,
        cantidad: it.cantidad,
        costo_unitario_snapshot: it.costo_unitario_snapshot,
        comision_unitaria_snapshot: it.comision_unitaria_snapshot,
        escala_aplicada: it.escala_aplicada,
      } satisfies MercVentaItem;
    });
    return { venta, items: mapped };
  } catch (e) {
    logErr("getVentaConItems", e, { ventaId });
    return null;
  }
}

export async function listRendiciones(
  filtros: { vendedorId?: string | null; desde?: string | null; hasta?: string | null; limit?: number } = {}
): Promise<MercRendicion[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    let q = sb
      .from("merc_rendiciones")
      .select(
        "id, vendedor_id, fecha, monto_rendido, comision_pagada, notas, created_at, merc_vendedores(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, filtros.limit ?? 200)));
    if (filtros.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId);
    if (filtros.desde) q = q.gte("fecha", filtros.desde);
    if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        vendedor_id: string;
        fecha: string;
        monto_rendido: number;
        comision_pagada: number;
        notas: string | null;
        created_at: string;
        merc_vendedores?: { nombre?: string } | null;
      };
      return {
        id: row.id,
        vendedor_id: row.vendedor_id,
        vendedor_nombre: row.merc_vendedores?.nombre ?? undefined,
        fecha: row.fecha,
        monto_rendido: row.monto_rendido,
        comision_pagada: row.comision_pagada,
        notas: row.notas,
        created_at: row.created_at,
      } satisfies MercRendicion;
    });
  } catch (e) {
    logErr("listRendiciones", e, filtros);
    return [];
  }
}

/** KPIs por vendedor entre dos fechas (inclusive). Devuelve totales y por vendedor. */
export type MercKpiRow = {
  vendedor_id: string;
  vendedor_nombre: string;
  ventas_cantidad: number;
  monto_total: number;
  comision_total: number;
  utilidad_total: number;
};

export async function getKpisPorVendedor(
  desde: string,
  hasta: string
): Promise<MercKpiRow[]> {
  const c = await ctx();
  if (!c) return [];
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const { data, error } = await sb
      .from("merc_ventas")
      .select(
        "vendedor_id, monto_total_real, comision_total_snapshot, utilidad_snapshot, merc_vendedores(nombre)"
      )
      .eq("empresa_id", c.empresa_id)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (error) throw error;
    const acc = new Map<string, MercKpiRow>();
    for (const r of (data ?? []) as Array<{
      vendedor_id: string;
      monto_total_real: number;
      comision_total_snapshot: number;
      utilidad_snapshot: number;
      merc_vendedores?: { nombre?: string } | null;
    }>) {
      const key = r.vendedor_id;
      const existing = acc.get(key) ?? {
        vendedor_id: key,
        vendedor_nombre: r.merc_vendedores?.nombre ?? "",
        ventas_cantidad: 0,
        monto_total: 0,
        comision_total: 0,
        utilidad_total: 0,
      };
      existing.ventas_cantidad += 1;
      existing.monto_total += Number(r.monto_total_real) || 0;
      existing.comision_total += Number(r.comision_total_snapshot) || 0;
      existing.utilidad_total += Number(r.utilidad_snapshot) || 0;
      acc.set(key, existing);
    }
    return [...acc.values()].sort((a, b) => a.vendedor_nombre.localeCompare(b.vendedor_nombre));
  } catch (e) {
    logErr("getKpisPorVendedor", e, { desde, hasta });
    return [];
  }
}
