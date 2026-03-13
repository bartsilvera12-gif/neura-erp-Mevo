import type { Compra } from "./types";
import { getProductos, saveMovimiento, updateProductoPrecios } from "@/lib/inventario/storage";

// ─── Datos de ejemplo ─────────────────────────────────────────────────────────

const COMPRAS_MOCK: Compra[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    numero_control: "COMP-000001",
    proveedor_id: "1",
    proveedor_nombre: "Textiles del Sur S.A.",
    producto_id: "00000000-0000-0000-0000-000000000001",
    producto_nombre: "Remera Oversize Blanca",
    cantidad: 50,
    moneda: "PYG",
    tipo_cambio: 1,
    costo_unitario_original: 35000,
    costo_unitario: 35000,
    iva_tipo: "10",
    subtotal: 1750000,
    monto_iva: 175000,
    total: 1925000,
    precio_venta: 75000,
    margen_venta: 53.33,
    tipo_pago: "contado",
    nro_timbrado: "001-001-0000001",
    fecha: "2026-03-01T08:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    numero_control: "COMP-000002",
    proveedor_id: "2",
    proveedor_nombre: "Importadora Asunción",
    producto_id: "00000000-0000-0000-0000-000000000003",
    producto_nombre: "Canguro Gris Unisex",
    cantidad: 20,
    moneda: "USD",
    tipo_cambio: 7500,
    costo_unitario_original: 12,
    costo_unitario: 90000,
    iva_tipo: "10",
    subtotal: 1800000,
    monto_iva: 180000,
    total: 1980000,
    precio_venta: 165000,
    margen_venta: 45.45,
    tipo_pago: "credito",
    plazo_dias: 30,
    nro_timbrado: "001-002-0000045",
    fecha: "2026-03-06T10:00:00.000Z",
  },
];

// ─── Clave de localStorage ────────────────────────────────────────────────────

const KEY = "neura_compras";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeGet<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage no disponible
  }
}

/**
 * Genera el próximo número de control en formato COMP-000001.
 * Lee el máximo existente y suma 1.
 */
function generarNumeroControl(base: Compra[]): string {
  const maxNum = base.reduce((max, c) => {
    const match = c.numero_control?.match(/COMP-(\d+)/);
    if (match) return Math.max(max, parseInt(match[1]));
    return max;
  }, 0);
  return `COMP-${String(maxNum + 1).padStart(6, "0")}`;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/** Devuelve todas las compras. Usa mocks si no hay datos guardados. */
export function getCompras(): Compra[] {
  const stored = safeGet<Compra[]>(KEY, []);
  return stored.length === 0 ? COMPRAS_MOCK : stored;
}

/**
 * Guarda una nueva compra e impacta inmediatamente en inventario:
 * 1. Genera número de control secuencial (COMP-000001, ...)
 * 2. Persiste la compra en localStorage
 * 3. Registra movimiento ENTRADA vinculado al número de control
 * 4. Actualiza precio_venta y costo_promedio del producto
 */
export async function saveCompra(datos: Omit<Compra, "id" | "numero_control" | "fecha">): Promise<Compra> {
  const existentes = safeGet<Compra[]>(KEY, []);
  const base = existentes.length === 0 ? [...COMPRAS_MOCK] : existentes;

  const nueva: Compra = {
    id: crypto.randomUUID(),
    numero_control: generarNumeroControl(base),
    fecha: new Date().toISOString(),
    ...datos,
  };

  safeSet(KEY, [...base, nueva]);

  const productos = await getProductos();
  const skuProducto = productos.find((p) => p.id === nueva.producto_id)?.sku ?? "";

  await saveMovimiento({
    producto_id: nueva.producto_id,
    producto_nombre: nueva.producto_nombre,
    producto_sku: skuProducto,
    tipo: "ENTRADA",
    cantidad: nueva.cantidad,
    costo_unitario: nueva.costo_unitario,
    origen: "compra",
    fecha: nueva.fecha,
    referencia: nueva.numero_control,
  });

  await updateProductoPrecios(nueva.producto_id, {
    precio_venta: nueva.precio_venta,
    costo_promedio: nueva.costo_unitario,
  });

  return nueva;
}
