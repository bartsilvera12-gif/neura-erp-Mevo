import type { EscalaAplicada, MercProducto, TipoVenta } from "./types";

/**
 * Reglas de escala (deducidas del Excel del cliente, encabezados
 * "PRECIO MAYORISTA DESDE 6" y "DESDE 12"):
 *
 * - Venta simple (1 solo producto, cantidad N):
 *     N ∈ [1..5]  → unitario
 *     N ∈ [6..11] → mayorista_6
 *     N ≥ 12      → mayorista_12
 *
 * - Combo (varios productos, cantidad total = suma de todas las líneas):
 *     total ∈ [1..5]  → unitario
 *     total ∈ [6..11] → mayorista_6 aplicada a cada producto
 *     total ≥ 12      → mayorista_12 aplicada a cada producto
 *
 * Si el producto no tiene mayorista (tiene_mayorista=false), se
 * usa siempre unitario sin importar la cantidad.
 */
export function elegirEscala(cantidadTotalOperacion: number): EscalaAplicada {
  if (cantidadTotalOperacion >= 12) return "mayorista_12";
  if (cantidadTotalOperacion >= 6) return "mayorista_6";
  return "unitario";
}

/** Cae a `unitario` cuando el producto no maneja mayoristas. */
export function escalaEfectiva(
  producto: Pick<MercProducto, "tiene_mayorista">,
  cantidadTotalOperacion: number
): EscalaAplicada {
  if (!producto.tiene_mayorista) return "unitario";
  return elegirEscala(cantidadTotalOperacion);
}

export function comisionPorEscala(
  producto: Pick<
    MercProducto,
    "comision_unitaria" | "comision_mayorista_6" | "comision_mayorista_12"
  >,
  escala: EscalaAplicada
): number {
  switch (escala) {
    case "mayorista_12":
      return Number(producto.comision_mayorista_12) || 0;
    case "mayorista_6":
      return Number(producto.comision_mayorista_6) || 0;
    default:
      return Number(producto.comision_unitaria) || 0;
  }
}

export function precioReferenciaPorEscala(
  producto: Pick<
    MercProducto,
    "precio_unitario" | "precio_mayorista_6" | "precio_mayorista_12"
  >,
  escala: EscalaAplicada
): number {
  switch (escala) {
    case "mayorista_12":
      return Number(producto.precio_mayorista_12) || 0;
    case "mayorista_6":
      return Number(producto.precio_mayorista_6) || 0;
    default:
      return Number(producto.precio_unitario) || 0;
  }
}

export type LineaCalculada = {
  producto_id: string;
  cantidad: number;
  costo_unitario_snapshot: number;
  comision_unitaria_snapshot: number;
  escala_aplicada: EscalaAplicada;
  subtotal_costo: number;
  subtotal_comision: number;
  precio_referencia_unitario: number;
};

export type OperacionCalculada = {
  tipo: TipoVenta;
  cantidad_total: number;
  precio_referencia_total: number;
  costo_total: number;
  comision_total: number;
  lineas: LineaCalculada[];
};

/**
 * Calcula todo lo derivable de una venta (simple o combo) a partir del
 * catálogo de productos y las líneas ingresadas. NO calcula la utilidad
 * porque depende del monto real que ingresa el vendedor.
 */
export function calcularOperacion(
  tipo: TipoVenta,
  lineas: Array<{ producto_id: string; cantidad: number }>,
  productosById: Map<string, MercProducto>
): OperacionCalculada {
  const limpias = lineas
    .map((l) => ({
      producto_id: String(l.producto_id ?? "").trim(),
      cantidad: Math.max(0, Math.trunc(Number(l.cantidad) || 0)),
    }))
    .filter((l) => l.producto_id && l.cantidad > 0);

  const cantidad_total = limpias.reduce((s, l) => s + l.cantidad, 0);

  const lineasCalculadas: LineaCalculada[] = limpias.map((l) => {
    const p = productosById.get(l.producto_id);
    if (!p) {
      return {
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        costo_unitario_snapshot: 0,
        comision_unitaria_snapshot: 0,
        escala_aplicada: "unitario",
        subtotal_costo: 0,
        subtotal_comision: 0,
        precio_referencia_unitario: 0,
      };
    }
    // En combo la escala usa el total del combo; en simple usa la cantidad de ESA línea
    // (por definición una venta simple tiene una única línea).
    const cantidadParaEscala = tipo === "combo" ? cantidad_total : l.cantidad;
    const escala = escalaEfectiva(p, cantidadParaEscala);
    const costo = Number(p.costo_unitario) || 0;
    const comision = comisionPorEscala(p, escala);
    const precioRef = precioReferenciaPorEscala(p, escala);
    return {
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      costo_unitario_snapshot: costo,
      comision_unitaria_snapshot: comision,
      escala_aplicada: escala,
      subtotal_costo: costo * l.cantidad,
      subtotal_comision: comision * l.cantidad,
      precio_referencia_unitario: precioRef,
    };
  });

  const costo_total = lineasCalculadas.reduce((s, l) => s + l.subtotal_costo, 0);
  const comision_total = lineasCalculadas.reduce((s, l) => s + l.subtotal_comision, 0);
  const precio_referencia_total = lineasCalculadas.reduce(
    (s, l) => s + l.precio_referencia_unitario * l.cantidad,
    0
  );

  return {
    tipo,
    cantidad_total,
    precio_referencia_total,
    costo_total,
    comision_total,
    lineas: lineasCalculadas,
  };
}

export function utilidad(precioReal: number, costoTotal: number, comisionTotal: number): number {
  return Number(precioReal) - Number(costoTotal) - Number(comisionTotal);
}
