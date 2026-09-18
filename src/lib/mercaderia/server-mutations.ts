"use server";

import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { calcularOperacion, utilidad } from "./escala";
import type { MercProducto, TipoVenta } from "./types";

const LOG = "[mercaderia][mut]";

function toErr(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240);
}

async function ctx() {
  const auth = await getUserAndEmpresa(null);
  if (!auth?.empresa_id) return null;
  const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
  return { empresa_id: auth.empresa_id, user_id: auth.user.id, schema };
}

function requirePool() {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Falta SUPABASE_DB_URL/DIRECT_URL para escribir en Postgres.");
  return pool;
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
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_productos");
    const r = await pool.query<{ id: string }>(
      `insert into ${t}
        (empresa_id, nombre, costo_unitario, precio_unitario, comision_unitaria,
         precio_mayorista_6, comision_mayorista_6, precio_mayorista_12, comision_mayorista_12,
         tiene_mayorista, activo, orden)
       values ($1::uuid, $2::text, $3::numeric, $4::numeric, $5::numeric,
               $6::numeric, $7::numeric, $8::numeric, $9::numeric,
               $10::boolean, $11::boolean, $12::int)
       returning id`,
      [
        c.empresa_id,
        String(input.nombre ?? "").trim(),
        Number(input.costo_unitario) || 0,
        Number(input.precio_unitario) || 0,
        Number(input.comision_unitaria) || 0,
        Number(input.precio_mayorista_6) || 0,
        Number(input.comision_mayorista_6) || 0,
        Number(input.precio_mayorista_12) || 0,
        Number(input.comision_mayorista_12) || 0,
        input.tiene_mayorista ?? true,
        input.activo ?? true,
        Number(input.orden) || 0,
      ]
    );
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    console.error(LOG, "createProducto", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

export async function updateProducto(id: string, patch: Partial<ProductoInput>): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_productos");
    const sets: string[] = [];
    const params: unknown[] = [];
    function add(col: string, value: unknown, type: string) {
      params.push(value);
      sets.push(`${col} = $${params.length}::${type}`);
    }
    if (patch.nombre !== undefined) add("nombre", String(patch.nombre).trim(), "text");
    if (patch.costo_unitario !== undefined) add("costo_unitario", Number(patch.costo_unitario) || 0, "numeric");
    if (patch.precio_unitario !== undefined) add("precio_unitario", Number(patch.precio_unitario) || 0, "numeric");
    if (patch.comision_unitaria !== undefined) add("comision_unitaria", Number(patch.comision_unitaria) || 0, "numeric");
    if (patch.precio_mayorista_6 !== undefined) add("precio_mayorista_6", Number(patch.precio_mayorista_6) || 0, "numeric");
    if (patch.comision_mayorista_6 !== undefined) add("comision_mayorista_6", Number(patch.comision_mayorista_6) || 0, "numeric");
    if (patch.precio_mayorista_12 !== undefined) add("precio_mayorista_12", Number(patch.precio_mayorista_12) || 0, "numeric");
    if (patch.comision_mayorista_12 !== undefined) add("comision_mayorista_12", Number(patch.comision_mayorista_12) || 0, "numeric");
    if (patch.tiene_mayorista !== undefined) add("tiene_mayorista", !!patch.tiene_mayorista, "boolean");
    if (patch.activo !== undefined) add("activo", !!patch.activo, "boolean");
    if (patch.orden !== undefined) add("orden", Number(patch.orden) || 0, "int");
    if (sets.length === 0) return { ok: true };
    params.push(id);
    params.push(c.empresa_id);
    await pool.query(
      `update ${t} set ${sets.join(", ")}
       where id = $${params.length - 1}::uuid and empresa_id = $${params.length}::uuid`,
      params
    );
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
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_vendedores");
    const r = await pool.query<{ id: string }>(
      `insert into ${t} (empresa_id, nombre, zona, user_id, activo, notas)
       values ($1::uuid, $2::text, $3::text, $4::uuid, $5::boolean, $6::text)
       returning id`,
      [
        c.empresa_id,
        String(input.nombre ?? "").trim(),
        input.zona ? String(input.zona).trim() : null,
        input.user_id ? String(input.user_id).trim() : null,
        input.activo ?? true,
        input.notas ? String(input.notas).trim() : null,
      ]
    );
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    console.error(LOG, "createVendedor", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

export async function updateVendedor(id: string, patch: Partial<VendedorInput>): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_vendedores");
    const sets: string[] = [];
    const params: unknown[] = [];
    function add(col: string, value: unknown, type: string) {
      params.push(value);
      sets.push(`${col} = $${params.length}::${type}`);
    }
    if (patch.nombre !== undefined) add("nombre", String(patch.nombre).trim(), "text");
    if (patch.zona !== undefined) add("zona", patch.zona ? String(patch.zona).trim() : null, "text");
    if (patch.user_id !== undefined) add("user_id", patch.user_id ? String(patch.user_id).trim() : null, "uuid");
    if (patch.activo !== undefined) add("activo", !!patch.activo, "boolean");
    if (patch.notas !== undefined) add("notas", patch.notas ? String(patch.notas).trim() : null, "text");
    if (sets.length === 0) return { ok: true };
    params.push(id);
    params.push(c.empresa_id);
    await pool.query(
      `update ${t} set ${sets.join(", ")}
       where id = $${params.length - 1}::uuid and empresa_id = $${params.length}::uuid`,
      params
    );
    return { ok: true };
  } catch (e) {
    console.error(LOG, "updateVendedor", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Asignaciones
// ────────────────────────────────────────────────────────────────────────────

export type AsignacionLinea = { producto_id: string; cantidad: number };

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
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tP = quoteSchemaTable(schema, "merc_productos");
    const tA = quoteSchemaTable(schema, "merc_asignaciones");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const costsRes = await client.query<{ id: string; costo_unitario: number | string }>(
        `select id, costo_unitario from ${tP}
         where empresa_id = $1::uuid and id = any($2::uuid[])`,
        [c.empresa_id, limpias.map((l) => l.producto_id)]
      );
      const costos = new Map<string, number>();
      for (const r of costsRes.rows) costos.set(String(r.id), Number(r.costo_unitario) || 0);
      const signo = opts.retirar ? -1 : 1;
      for (const l of limpias) {
        await client.query(
          `insert into ${tA}
            (empresa_id, vendedor_id, producto_id, cantidad, costo_unitario_snapshot, notas, creado_por)
           values ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::numeric, $6::text, $7::uuid)`,
          [
            c.empresa_id,
            vendedorId,
            l.producto_id,
            signo * l.cantidad,
            costos.get(l.producto_id) ?? 0,
            opts.notas ?? null,
            c.user_id,
          ]
        );
      }
      await client.query("commit");
      return { ok: true, asignadas: limpias.length };
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
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
  fecha?: string | null;
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
    const pool = requirePool();
    const schema = assertAllowedChatDataSchema(c.schema);
    const tP = quoteSchemaTable(schema, "merc_productos");
    const tV = quoteSchemaTable(schema, "merc_ventas");
    const tI = quoteSchemaTable(schema, "merc_ventas_items");
    const tS = quoteSchemaTable(schema, "merc_stock_vendedor_v");

    const productoIds = Array.from(new Set(input.lineas.map((l) => String(l.producto_id ?? "").trim()).filter(Boolean)));

    const client = await pool.connect();
    try {
      await client.query("begin");

      const pRes = await client.query(
        `select id, nombre, costo_unitario, precio_unitario, comision_unitaria,
                precio_mayorista_6, comision_mayorista_6, precio_mayorista_12, comision_mayorista_12,
                tiene_mayorista, activo, orden
           from ${tP}
          where empresa_id = $1::uuid and id = any($2::uuid[])`,
        [c.empresa_id, productoIds]
      );
      const productosById = new Map<string, MercProducto>();
      for (const row of pRes.rows) {
        productosById.set(String(row.id), {
          id: String(row.id),
          nombre: String(row.nombre),
          costo_unitario: Number(row.costo_unitario) || 0,
          precio_unitario: Number(row.precio_unitario) || 0,
          comision_unitaria: Number(row.comision_unitaria) || 0,
          precio_mayorista_6: Number(row.precio_mayorista_6) || 0,
          comision_mayorista_6: Number(row.comision_mayorista_6) || 0,
          precio_mayorista_12: Number(row.precio_mayorista_12) || 0,
          comision_mayorista_12: Number(row.comision_mayorista_12) || 0,
          tiene_mayorista: !!row.tiene_mayorista,
          activo: !!row.activo,
          orden: Number(row.orden) || 0,
        });
      }

      const op = calcularOperacion(tipo, input.lineas, productosById);
      if (op.cantidad_total <= 0) {
        await client.query("rollback");
        return { ok: false, error: "sin_cantidades" };
      }

      const stockRes = await client.query(
        `select producto_id, stock from ${tS}
         where empresa_id = $1::uuid and vendedor_id = $2::uuid and producto_id = any($3::uuid[])`,
        [c.empresa_id, input.vendedor_id, productoIds]
      );
      const stockPorProducto = new Map<string, number>();
      for (const r of stockRes.rows) stockPorProducto.set(String(r.producto_id), Number(r.stock) || 0);
      for (const l of op.lineas) {
        const disponible = stockPorProducto.get(l.producto_id) ?? 0;
        if (l.cantidad > disponible) {
          await client.query("rollback");
          const nombre = productosById.get(l.producto_id)?.nombre ?? l.producto_id;
          return {
            ok: false,
            error: `Stock insuficiente para ${nombre}: pediste ${l.cantidad}, hay ${disponible}.`,
          };
        }
      }

      const util = utilidad(monto, op.costo_total, op.comision_total);
      const fecha = (input.fecha ?? "").trim() || new Date().toISOString().slice(0, 10);

      const insV = await client.query<{ id: string }>(
        `insert into ${tV}
          (empresa_id, vendedor_id, fecha, tipo, monto_total_real,
           costo_total_snapshot, comision_total_snapshot, utilidad_snapshot,
           notas, creado_por)
         values ($1::uuid, $2::uuid, $3::date, $4::text, $5::numeric,
                 $6::numeric, $7::numeric, $8::numeric,
                 $9::text, $10::uuid)
         returning id`,
        [
          c.empresa_id,
          input.vendedor_id,
          fecha,
          tipo,
          monto,
          op.costo_total,
          op.comision_total,
          util,
          input.notas ? String(input.notas).trim() : null,
          c.user_id,
        ]
      );
      const ventaId = insV.rows[0].id;

      for (const l of op.lineas) {
        await client.query(
          `insert into ${tI}
            (empresa_id, venta_id, producto_id, cantidad,
             costo_unitario_snapshot, comision_unitaria_snapshot, escala_aplicada)
           values ($1::uuid, $2::uuid, $3::uuid, $4::int,
                   $5::numeric, $6::numeric, $7::text)`,
          [
            c.empresa_id,
            ventaId,
            l.producto_id,
            l.cantidad,
            l.costo_unitario_snapshot,
            l.comision_unitaria_snapshot,
            l.escala_aplicada,
          ]
        );
      }

      await client.query("commit");
      return { ok: true, id: ventaId };
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
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

/**
 * Anular una venta ya registrada. Marca la fila como anulada (soft delete)
 * y la vista `merc_stock_vendedor_v` deja de contar sus items → el stock
 * queda como si la venta nunca hubiera existido.
 *
 * Se conserva el registro para auditoría; sale de KPIs, dashboard y de los
 * listados por default. Se puede consultar con `anuladas: "solo_anuladas"`.
 */
export async function anularVenta(
  ventaId: string,
  opts: { motivo?: string | null; scope?: "admin" | "vendedor"; vendedorIdActor?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  if (!ventaId) return { ok: false, error: "sin_id" };
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_ventas");
    // Un vendedor solo puede anular sus propias ventas.
    const params: unknown[] = [
      new Date().toISOString(),
      c.user_id,
      opts.motivo ? String(opts.motivo).trim().slice(0, 500) : null,
      ventaId,
      c.empresa_id,
    ];
    let scopeCond = "";
    if (opts.scope === "vendedor" && opts.vendedorIdActor) {
      params.push(opts.vendedorIdActor);
      scopeCond = ` and vendedor_id = $${params.length}::uuid`;
    }
    const r = await pool.query(
      `update ${t}
          set anulada = true,
              anulada_at = $1::timestamptz,
              anulada_por = $2::uuid,
              motivo_anulacion = coalesce($3::text, motivo_anulacion)
        where id = $4::uuid
          and empresa_id = $5::uuid
          and anulada = false${scopeCond}
        returning id`,
      params
    );
    if (r.rowCount === 0) return { ok: false, error: "venta_no_encontrada_o_ya_anulada" };
    return { ok: true };
  } catch (e) {
    console.error(LOG, "anularVenta", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}

export async function registrarRendicion(input: RendicionInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "no_session" };
  if (!input.vendedor_id) return { ok: false, error: "sin_vendedor" };
  try {
    const pool = requirePool();
    const t = quoteSchemaTable(assertAllowedChatDataSchema(c.schema), "merc_rendiciones");
    const fecha = (input.fecha ?? "").trim() || new Date().toISOString().slice(0, 10);
    const r = await pool.query<{ id: string }>(
      `insert into ${t}
        (empresa_id, vendedor_id, fecha, monto_rendido, comision_pagada, notas, creado_por)
       values ($1::uuid, $2::uuid, $3::date, $4::numeric, $5::numeric, $6::text, $7::uuid)
       returning id`,
      [
        c.empresa_id,
        input.vendedor_id,
        fecha,
        Number(input.monto_rendido) || 0,
        Number(input.comision_pagada) || 0,
        input.notas ? String(input.notas).trim() : null,
        c.user_id,
      ]
    );
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    console.error(LOG, "registrarRendicion", toErr(e));
    return { ok: false, error: toErr(e) };
  }
}
