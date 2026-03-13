export type Periodicidad  = "mensual" | "anual" | "unico";
export type MonedaPlan    = "GS" | "USD";
export type EstadoPlan    = "activo" | "inactivo";

export interface Plan {
  id:               string;
  codigo_plan:      string;          // PLAN-0001

  nombre:           string;
  descripcion?:     string;

  precio:           number;
  moneda:           MonedaPlan;

  periodicidad:     Periodicidad;

  limite_usuarios:  number | null;   // null = ilimitado
  limite_clientes:  number | null;
  limite_facturas:  number | null;

  estado:           EstadoPlan;

  created_at:       string;          // ISO string
  updated_at:       string;          // ISO string
}
