import type { Venta, LineaVenta, TipoIvaVenta } from "./types";
import { getProductos, saveMovimiento } from "@/lib/inventario/storage";

// ─── Datos de ejemplo (nuevo formato multi-ítem) ──────────────────────────────

const VENTAS_MOCK: Venta[] = [
  {
    id: 1,
    numero_control: "VTA-000001",
    items: [
      {
        producto_id:           "00000000-0000-0000-0000-000000000001",
        producto_nombre:       "REMERA OVERSIZE BLANCA",
        sku:                   "OOTD-001",
        cantidad:              5,
        precio_venta_original: 75000,
        precio_venta:          75000,
        tipo_iva:              "10%",
        subtotal:              375000,
        monto_iva:             37500,
        total_linea:           412500,
      },
    ],
    moneda:     "GS",
    tipo_cambio: 1,
    subtotal:   375000,
    monto_iva:   37500,
    total:      412500,
    tipo_venta: "CONTADO",
    fecha:      "2026-03-02T10:00:00.000Z",
  },
  {
    id: 2,
    numero_control: "VTA-000002",
    items: [
      {
        producto_id:           "00000000-0000-0000-0000-000000000002",
        producto_nombre:       "POLO NEGRA PREMIUM",
        sku:                   "OOTD-002",
        cantidad:              3,
        precio_venta_original: 110000,
        precio_venta:          110000,
        tipo_iva:              "10%",
        subtotal:              330000,
        monto_iva:              33000,
        total_linea:           363000,
      },
      {
        producto_id:           "00000000-0000-0000-0000-000000000001",
        producto_nombre:       "REMERA OVERSIZE BLANCA",
        sku:                   "OOTD-001",
        cantidad:              2,
        precio_venta_original: 75000,
        precio_venta:          75000,
        tipo_iva:              "10%",
        subtotal:              150000,
        monto_iva:              15000,
        total_linea:           165000,
      },
    ],
    moneda:      "GS",
    tipo_cambio:  1,
    subtotal:    480000,
    monto_iva:    48000,
    total:       528000,
    tipo_venta:  "CREDITO",
    plazo_dias:   30,
    fecha:       "2026-03-04T14:30:00.000Z",
  },
];

// ─── Clave de localStorage ────────────────────────────────────────────────────

const KEY = "neura_ventas";

// ─── Helpers internos ─────────────────────────────────────────────────────────

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

function calcIva(tipo: TipoIvaVenta, base: number): number {
  if (tipo === "EXENTA") return 0;
  if (tipo === "5%")     return base * 0.05;
  return base * 0.10;
}

function generarNumeroControl(base: Venta[]): string {
  const maxNum = base.reduce((max, v) => {
    const match = v.numero_control?.match(/VTA-(\d+)/);
    if (match) return Math.max(max, parseInt(match[1]));
    return max;
  }, 0);
  return `VTA-${String(maxNum + 1).padStart(6, "0")}`;
}

/**
 * Migra una venta del formato antiguo (un solo producto en la raíz)
 * al nuevo formato con items[].
 */
function migrarVentaLegacy(v: Record<string, unknown>): Venta {
  if (Array.isArray(v.items)) return v as unknown as Venta;

  const precioVenta  = (v.precio_venta  as number) || 0;
  const cantidad     = (v.cantidad      as number) || 0;
  const tipo_iva     = (v.tipo_iva      as TipoIvaVenta) || "10%";
  const subtotal     = precioVenta * cantidad;
  const monto_iva    = calcIva(tipo_iva, subtotal);
  const total_linea  = subtotal + monto_iva;

  const item: LineaVenta = {
    producto_id:           typeof v.producto_id === "string" ? v.producto_id : String(v.producto_id ?? ""),
    producto_nombre:       (v.producto_nombre  as string) || "",
    sku:                   (v.sku              as string) || "",
    cantidad,
    precio_venta_original: (v.precio_venta_original as number) || precioVenta,
    precio_venta:          precioVenta,
    tipo_iva,
    subtotal,
    monto_iva,
    total_linea,
  };

  return {
    id:             (v.id             as number),
    numero_control: (v.numero_control as string),
    items:          [item],
    moneda:         (v.moneda         as Venta["moneda"])      || "GS",
    tipo_cambio:    (v.tipo_cambio    as number)               || 1,
    subtotal:       (v.subtotal       as number)               || subtotal,
    monto_iva:      (v.monto_iva      as number)               || monto_iva,
    total:          (v.total          as number)               || total_linea,
    tipo_venta:     (v.tipo_venta     as Venta["tipo_venta"])  || "CONTADO",
    plazo_dias:     v.plazo_dias as number | undefined,
    fecha:          (v.fecha          as string),
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Devuelve todas las ventas. Migra datos viejos si existen. */
export function getVentas(): Venta[] {
  const stored = safeGet<Record<string, unknown>[]>(KEY, []);
  if (stored.length === 0) return VENTAS_MOCK;
  return stored.map(migrarVentaLegacy);
}

export type ResultadoGuardarVenta =
  | { success: true;  venta: Venta }
  | { success: false; error: string };

/**
 * Guarda una nueva venta e impacta en inventario:
 * 1. Valida stock para todos los ítems en conjunto (evita overselling)
 * 2. Genera número de control secuencial (VTA-000001, …)
 * 3. Persiste la venta en localStorage
 * 4. Por cada ítem: registra un movimiento SALIDA con referencia a la venta
 */
export async function saveVenta(
  datos: Omit<Venta, "id" | "numero_control" | "fecha">
): Promise<ResultadoGuardarVenta> {
  if (!datos.items || datos.items.length === 0) {
    return { success: false, error: "La venta debe tener al menos un producto." };
  }

  const productos = await getProductos();

  const stockMap: Record<string, number> = {};
  for (const p of productos) {
    stockMap[p.id] = p.stock_actual;
  }

  for (const item of datos.items) {
    if (stockMap[item.producto_id] === undefined) {
      return {
        success: false,
        error: `Producto "${item.producto_nombre}" no encontrado en inventario.`,
      };
    }
    if (stockMap[item.producto_id] < item.cantidad) {
      return {
        success: false,
        error: `Stock insuficiente para "${item.producto_nombre}". Disponible: ${stockMap[item.producto_id]} u.`,
      };
    }
    stockMap[item.producto_id] -= item.cantidad;
  }

  const existentes = safeGet<Record<string, unknown>[]>(KEY, []);
  const base = existentes.length === 0
    ? (VENTAS_MOCK as unknown as Record<string, unknown>[])
    : existentes;

  const nueva: Venta = {
    id:             Date.now(),
    numero_control: generarNumeroControl(base as unknown as Venta[]),
    fecha:          new Date().toISOString(),
    ...datos,
  };

  safeSet(KEY, [...base, nueva]);

  for (const item of nueva.items) {
    const prodInfo = productos.find((p) => p.id === item.producto_id);
    await saveMovimiento({
      producto_id:     item.producto_id,
      producto_nombre: item.producto_nombre,
      producto_sku:    item.sku,
      tipo:            "SALIDA",
      cantidad:        item.cantidad,
      costo_unitario:  prodInfo?.costo_promedio ?? 0,
      origen:          "venta",
      fecha:           nueva.fecha,
      referencia:      nueva.numero_control,
    });
  }

  return { success: true, venta: nueva };
}
