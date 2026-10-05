import "server-only";

import { listProductos, listStockPorVendedor, listVendedores } from "./server-queries";
import type { MercVendedor } from "./types";

/**
 * Reporte "Stock de mercadería e inversión".
 *
 * Inversión = stock × costo_unitario (SIEMPRE con el costo del producto, nunca
 * el precio de venta). El stock sale de merc_stock_vendedor_v (lo que tienen los
 * vendedores). Sin vendedor seleccionado = stock general (suma de todos).
 */

export type StockInversionRow = {
  producto_id: string;
  producto_nombre: string;
  costo_unitario: number;
  stock: number;
  inversion: number;
};

export type StockInversionReport = {
  rows: StockInversionRow[];
  totalUnidades: number;
  totalInversion: number;
  vendedores: MercVendedor[];
  productos: { id: string; nombre: string }[];
  /** Nombre del vendedor filtrado, o null cuando es el total general. */
  vendedorNombre: string | null;
};

export async function fetchStockInversionReport(opts: {
  vendedorId?: string | null;
  productoId?: string | null;
}): Promise<StockInversionReport> {
  const vendedorId = opts.vendedorId?.trim() || null;
  const productoId = opts.productoId?.trim() || null;

  const [productos, stock, vendedores] = await Promise.all([
    listProductos(true), // solo activos
    listStockPorVendedor(vendedorId), // scoped al vendedor si viene; si no, todos
    listVendedores(false),
  ]);

  const stockByProd = new Map<string, number>();
  for (const s of stock) {
    stockByProd.set(s.producto_id, (stockByProd.get(s.producto_id) ?? 0) + (Number(s.stock) || 0));
  }

  let rows: StockInversionRow[] = productos.map((p) => {
    const st = stockByProd.get(p.id) ?? 0;
    const costo = Number(p.costo_unitario) || 0;
    return {
      producto_id: p.id,
      producto_nombre: p.nombre,
      costo_unitario: costo,
      stock: st,
      inversion: st * costo,
    };
  });

  if (productoId) {
    rows = rows.filter((r) => r.producto_id === productoId);
  } else {
    // "Disponibles": no listamos productos sin stock en el alcance elegido.
    rows = rows.filter((r) => r.stock > 0);
  }
  rows.sort((a, b) => b.inversion - a.inversion || a.producto_nombre.localeCompare(b.producto_nombre, "es"));

  const totalUnidades = rows.reduce((s, r) => s + r.stock, 0);
  const totalInversion = rows.reduce((s, r) => s + r.inversion, 0);

  const vendedorNombre = vendedorId
    ? vendedores.find((v) => v.id === vendedorId)?.nombre ?? null
    : null;

  return {
    rows,
    totalUnidades,
    totalInversion,
    vendedores,
    productos: productos.map((p) => ({ id: p.id, nombre: p.nombre })),
    vendedorNombre,
  };
}
