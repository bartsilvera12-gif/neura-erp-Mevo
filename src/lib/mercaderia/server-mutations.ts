"use server";

import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import { calcularOperacion, utilidad } from "./escala";
import type { MercProducto, TipoVenta } from "./types";

const LOG = "[mercaderia][mut]";

function toErr(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240);
}

async function ctx() {
  const auth = await getUserAndEmpresa(null);
  if (!auth?.empresa_id) return null;
  return { empresa_id: auth.empresa_id, user_id: auth.user.id };
}

// ────────────────────────────────────────────────────────────────────────────
// Productos
// ────────────────────────────────────────────────────────────────────────────

export type ProductoInput = {
  nombre: string;
  costo_unitario: number;
  precio_unitario: number;
  comision_unitaria: number;
  precio_mayorista_6?: number;
  comision_mayorista_6?: number;
  precio_mayorista_12?: number;
  comision_mayorista_12?: number;
  tiene_mayorista?: boolean;
  activo?: boolean;
  orden?: number;
};

export async function createProducto(input: ProductoInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const { data, error } = await sb
      .from("merc_productos")
      .insert({
        empresa_id: c.empresa_id,
        nombre: String(input.nombre ?? "").trim(),
        costo_unitario: Number(input.costo_unitario) || 0,
        precio_unitario: Number(input.precio_unitario) || 0,
        comision_unitaria: Number(input.comision_unitaria) || 0,
        precio_mayorista_6: Number(input.precio_mayorista_6) || 0,
        comision_mayorista_6: Number(input.comision_mayorista_6) || 0,
        precio_mayorista_12: Number(input.precio_mayorista_12) || 0,
        comision_mayorista_12: Number(input.comision_mayorista_12) || 0,
        tiene_mayorista: input.tiene_mayorista ?? true,
        activo: input.activo ?? true,
        orden: Number(input.orden) || 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    console.error(LOG, "createProducto", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

export async function updateProducto(id: string, patch: Partial<ProductoInput>): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const upd: Record<string, unknown> = {};
    if (patch.nombre !== undefined) upd.nombre = String(patch.nombre).trim();
    if (patch.costo_unitario !== undefined) upd.costo_unitario = Number(patch.costo_unitario) || 0;
    if (patch.precio_unitario !== undefined) upd.precio_unitario = Number(patch.precio_unitario) || 0;
    if (patch.comision_unitaria !== undefined) upd.comision_unitaria = Number(patch.comision_unitaria) || 0;
    if (patch.precio_mayorista_6 !== undefined) upd.precio_mayorista_6 = Number(patch.precio_mayorista_6) || 0;
    if (patch.comision_mayorista_6 !== undefined) upd.comision_mayorista_6 = Number(patch.comision_mayorista_6) || 0;
    if (patch.precio_mayorista_12 !== undefined) upd.precio_mayorista_12 = Number(patch.precio_mayorista_12) || 0;
    if (patch.comision_mayorista_12 !== undefined) upd.comision_mayorista_12 = Number(patch.comision_mayorista_12) || 0;
    if (patch.tiene_mayorista !== undefined) upd.tiene_mayorista = !!patch.tiene_mayorista;
    if (patch.activo !== undefined) upd.activo = !!patch.activo;
    if (patch.orden !== undefined) upd.orden = Number(patch.orden) || 0;
    if (Object.keys(upd).length === 0) return { ok: true };
    const { error } = await sb
      .from("merc_productos")
      .update(upd)
      .eq("id", id)
      .eq("empresa_id", c.empresa_id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error(LOG, "updateProducto", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Vendedores
// ────────────────────────────────────────────────────────────────────────────

export type VendedorInput = {
  nombre: string;
  zona?: string | null;
  user_id?: string | null;
  activo?: boolean;
  notas?: string | null;
};

export async function createVendedor(input: VendedorInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const { data, error } = await sb
      .from("merc_vendedores")
      .insert({
        empresa_id: c.empresa_id,
        nombre: String(input.nombre ?? "").trim(),
        zona: input.zona ? String(input.zona).trim() : null,
        user_id: input.user_id ? String(input.user_id).trim() : null,
        activo: input.activo ?? true,
        notas: input.notas ? String(input.notas).trim() : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    console.error(LOG, "createVendedor", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

export async function updateVendedor(id: string, patch: Partial<VendedorInput>): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const upd: Record<string, unknown> = {};
    if (patch.nombre !== undefined) upd.nombre = String(patch.nombre).trim();
    if (patch.zona !== undefined) upd.zona = patch.zona ? String(patch.zona).trim() : null;
    if (patch.user_id !== undefined) upd.user_id = patch.user_id ? String(patch.user_id).trim() : null;
    if (patch.activo !== undefined) upd.activo = !!patch.activo;
    if (patch.notas !== undefined) upd.notas = patch.notas ? String(patch.notas).trim() : null;
    if (Object.keys(upd).length === 0) return { ok: true };
    const { error } = await sb
      .from("merc_vendedores")
      .update(upd)
      .eq("id", id)
      .eq("empresa_id", c.empresa_id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error(LOG, "updateVendedor", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Asignaciones de stock
// ────────────────────────────────────────────────────────────────────────────

export type AsignacionLinea = { producto_id: string; cantidad: number };

/**
 * Registra un lote de asignaciones (una fila por producto) para un vendedor.
 * La cantidad se toma como positiva (asignar). Para retirar stock, pasar
 * `retirar: true` (guarda cantidades negativas).
 */
export async function asignarMercaderia(
  vendedorId: string,
  lineas: AsignacionLinea[],
  opts: { retirar?: boolean; notas?: string | null } = {}
): Promise<{ ok: boolean; error?: string; asignadas?: number }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  const limpias = lineas
    .map((l) => ({
      producto_id: String(l.producto_id ?? "").trim(),
      cantidad: Math.max(0, Math.trunc(Number(l.cantidad) || 0)),
    }))
    .filter((l) => l.producto_id && l.cantidad > 0);
  if (limpias.length === 0) return { ok: false, error: "sin_lineas" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    // Traer snapshot de costo actual para cada producto
    const { data: prodRows, error: pErr } = await sb
      .from("merc_productos")
      .select("id, costo_unitario")
      .eq("empresa_id", c.empresa_id)
      .in("id", limpias.map((l) => l.producto_id));
    if (pErr) throw pErr;
    const costos = new Map<string, number>();
    for (const r of (prodRows ?? []) as Array<{ id: string; costo_unitario: number }>) {
      costos.set(r.id, Number(r.costo_unitario) || 0);
    }
    const signo = opts.retirar ? -1 : 1;
    const rows = limpias.map((l) => ({
      empresa_id: c.empresa_id,
      vendedor_id: vendedorId,
      producto_id: l.producto_id,
      cantidad: signo * l.cantidad,
      costo_unitario_snapshot: costos.get(l.producto_id) ?? 0,
      notas: opts.notas ?? null,
      creado_por: c.user_id,
    }));
    const { error } = await sb.from("merc_asignaciones").insert(rows);
    if (error) throw error;
    return { ok: true, asignadas: rows.length };
  } catch (e) {
    console.error(LOG, "asignarMercaderia", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Ventas (simple + combo)
// ────────────────────────────────────────────────────────────────────────────

export type VentaInput = {
  vendedor_id: string;
  tipo: TipoVenta;
  fecha?: string | null; // YYYY-MM-DD; default hoy
  monto_total_real: number;
  lineas: Array<{ producto_id: string; cantidad: number }>;
  notas?: string | null;
};

export async function registrarVenta(input: VentaInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  const tipo = input.tipo === "combo" ? "combo" : "simple";
  const monto = Number(input.monto_total_real) || 0;
  if (monto < 0) return { ok: false, error: "monto_invalido" };
  if (!input.vendedor_id) return { ok: false, error: "sin_vendedor" };
  if (!Array.isArray(input.lineas) || input.lineas.length === 0) return { ok: false, error: "sin_lineas" };
  if (tipo === "simple" && input.lineas.length !== 1) {
    return { ok: false, error: "venta_simple_debe_tener_una_linea" };
  }

  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);

    // Cargar productos referenciados
    const productoIds = Array.from(new Set(input.lineas.map((l) => String(l.producto_id ?? "").trim()).filter(Boolean)));
    const { data: prodRows, error: pErr } = await sb
      .from("merc_productos")
      .select(
        "id, nombre, costo_unitario, precio_unitario, comision_unitaria, precio_mayorista_6, comision_mayorista_6, precio_mayorista_12, comision_mayorista_12, tiene_mayorista, activo, orden"
      )
      .eq("empresa_id", c.empresa_id)
      .in("id", productoIds);
    if (pErr) throw pErr;
    const productosById = new Map<string, MercProducto>(
      ((prodRows ?? []) as MercProducto[]).map((p) => [p.id, p])
    );

    const op = calcularOperacion(tipo, input.lineas, productosById);
    if (op.cantidad_total <= 0) return { ok: false, error: "sin_cantidades" };

    // Chequeo de stock por vendedor: para cada producto pedido, cuánto tiene.
    const { data: stockRows, error: sErr } = await sb
      .from("merc_stock_vendedor_v")
      .select("producto_id, stock")
      .eq("empresa_id", c.empresa_id)
      .eq("vendedor_id", input.vendedor_id)
      .in("producto_id", productoIds);
    if (sErr) throw sErr;
    const stockPorProducto = new Map<string, number>();
    for (const r of (stockRows ?? []) as Array<{ producto_id: string; stock: number }>) {
      stockPorProducto.set(r.producto_id, Number(r.stock) || 0);
    }
    for (const l of op.lineas) {
      const disponible = stockPorProducto.get(l.producto_id) ?? 0;
      if (l.cantidad > disponible) {
        const nombre = productosById.get(l.producto_id)?.nombre ?? l.producto_id;
        return {
          ok: false,
          error: `Stock insuficiente para ${nombre}: pediste ${l.cantidad}, hay ${disponible}.`,
        };
      }
    }

    const util = utilidad(monto, op.costo_total, op.comision_total);
    const fecha = (input.fecha ?? "").trim() || new Date().toISOString().slice(0, 10);

    const { data: vRow, error: vErr } = await sb
      .from("merc_ventas")
      .insert({
        empresa_id: c.empresa_id,
        vendedor_id: input.vendedor_id,
        fecha,
        tipo,
        monto_total_real: monto,
        costo_total_snapshot: op.costo_total,
        comision_total_snapshot: op.comision_total,
        utilidad_snapshot: util,
        notas: input.notas ? String(input.notas).trim() : null,
        creado_por: c.user_id,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;
    const ventaId = (vRow as { id: string }).id;

    const items = op.lineas.map((l) => ({
      empresa_id: c.empresa_id,
      venta_id: ventaId,
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      costo_unitario_snapshot: l.costo_unitario_snapshot,
      comision_unitaria_snapshot: l.comision_unitaria_snapshot,
      escala_aplicada: l.escala_aplicada,
    }));
    const { error: iErr } = await sb.from("merc_ventas_items").insert(items);
    if (iErr) {
      // Rollback manual del header si falló insertar items.
      await sb.from("merc_ventas").delete().eq("id", ventaId).eq("empresa_id", c.empresa_id);
      throw iErr;
    }
    return { ok: true, id: ventaId };
  } catch (e) {
    console.error(LOG, "registrarVenta", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Rendiciones
// ────────────────────────────────────────────────────────────────────────────

export type RendicionInput = {
  vendedor_id: string;
  fecha?: string | null;
  monto_rendido: number;
  comision_pagada: number;
  notas?: string | null;
};

export async function registrarRendicion(input: RendicionInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  if (!input.vendedor_id) return { ok: false, error: "sin_vendedor" };
  try {
    const sb = await getChatServiceClientForEmpresa(c.empresa_id);
    const fecha = (input.fecha ?? "").trim() || new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from("merc_rendiciones")
      .insert({
        empresa_id: c.empresa_id,
        vendedor_id: input.vendedor_id,
        fecha,
        monto_rendido: Number(input.monto_rendido) || 0,
        comision_pagada: Number(input.comision_pagada) || 0,
        notas: input.notas ? String(input.notas).trim() : null,
        creado_por: c.user_id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    console.error(LOG, "registrarRendicion", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}
