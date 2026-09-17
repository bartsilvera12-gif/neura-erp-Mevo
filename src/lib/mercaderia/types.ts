export type EscalaAplicada = "unitario" | "mayorista_6" | "mayorista_12";
export type TipoVenta = "simple" | "combo";

export interface MercProducto {
  id: string;
  nombre: string;
  costo_unitario: number;
  precio_unitario: number;
  comision_unitaria: number;
  precio_mayorista_6: number;
  comision_mayorista_6: number;
  precio_mayorista_12: number;
  comision_mayorista_12: number;
  tiene_mayorista: boolean;
  activo: boolean;
  orden: number;
}

export interface MercVendedor {
  id: string;
  user_id: string | null;
  nombre: string;
  zona: string | null;
  activo: boolean;
  notas: string | null;
}

export interface MercAsignacion {
  id: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  producto_id: string;
  producto_nombre?: string;
  cantidad: number;
  costo_unitario_snapshot: number;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface MercVenta {
  id: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  fecha: string;
  tipo: TipoVenta;
  monto_total_real: number;
  costo_total_snapshot: number;
  comision_total_snapshot: number;
  utilidad_snapshot: number;
  notas: string | null;
  created_at: string;
}

export interface MercVentaItem {
  id: string;
  venta_id: string;
  producto_id: string;
  producto_nombre?: string;
  cantidad: number;
  costo_unitario_snapshot: number;
  comision_unitaria_snapshot: number;
  escala_aplicada: EscalaAplicada;
}

export interface MercStockVendedor {
  vendedor_id: string;
  vendedor_nombre: string;
  producto_id: string;
  producto_nombre: string;
  stock: number;
}

export interface MercRendicion {
  id: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  fecha: string;
  monto_rendido: number;
  comision_pagada: number;
  notas: string | null;
  created_at: string;
}
