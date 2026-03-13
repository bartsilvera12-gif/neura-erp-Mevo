import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import type { Plan, EstadoPlan } from "./types";

// ─── Tipos de fila Supabase ───────────────────────────────────────────────────

interface PlanRow {
  id: string;
  empresa_id: string;
  codigo_plan: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  moneda: string;
  periodicidad: string;
  limite_usuarios: number | null;
  limite_clientes: number | null;
  limite_facturas: number | null;
  estado: string;
  created_at: string;
  updated_at: string;
}

// ─── Mapeo fila → tipo ────────────────────────────────────────────────────────

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    codigo_plan: row.codigo_plan,
    nombre: row.nombre,
    descripcion: row.descripcion ?? undefined,
    precio: Number(row.precio),
    moneda: row.moneda as Plan["moneda"],
    periodicidad: row.periodicidad as Plan["periodicidad"],
    limite_usuarios: row.limite_usuarios,
    limite_clientes: row.limite_clientes,
    limite_facturas: row.limite_facturas,
    estado: row.estado as EstadoPlan,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generarCodigoPlan(): Promise<string> {
  const { data } = await supabase
    .from("planes")
    .select("codigo_plan")
    .order("created_at", { ascending: false })
    .limit(1);

  const last = data?.[0] as { codigo_plan?: string } | undefined;
  const match = last?.codigo_plan?.match(/PLAN-(\d+)/);
  const next = (parseInt(match?.[1] ?? "0") + 1);
  return `PLAN-${String(next).padStart(4, "0")}`;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Lista planes. RLS filtra por empresa. */
export async function getPlanes(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("planes")
    .select("*")
    .order("codigo_plan");

  if (error) {
    console.error("[planes] getPlanes:", error.message);
    return [];
  }
  return (data as PlanRow[]).map(rowToPlan);
}

/** Obtiene un plan por ID. */
export async function getPlan(id: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from("planes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[planes] getPlan:", error.message);
    return null;
  }
  return rowToPlan(data as PlanRow);
}

export type NuevoPlanData = Omit<Plan, "id" | "codigo_plan" | "created_at" | "updated_at">;

/** Crea plan. empresa_id desde getCurrentUser(). */
export async function savePlan(datos: NuevoPlanData): Promise<Plan | null> {
  const usuario = await getCurrentUser();
  if (!usuario?.empresa_id) throw new Error("Usuario no autenticado o sin empresa");

  const codigoPlan = await generarCodigoPlan();

  const insert = {
    empresa_id: usuario.empresa_id,
    codigo_plan: codigoPlan,
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? null,
    precio: datos.precio,
    moneda: datos.moneda,
    periodicidad: datos.periodicidad,
    limite_usuarios: datos.limite_usuarios ?? null,
    limite_clientes: datos.limite_clientes ?? null,
    limite_facturas: datos.limite_facturas ?? null,
    estado: datos.estado,
  };

  const { data, error } = await supabase
    .from("planes")
    .insert([insert])
    .select()
    .single();

  if (error) {
    console.error("[planes] savePlan:", error.message);
    return null;
  }
  return rowToPlan(data as PlanRow);
}

/** Actualiza plan. */
export async function updatePlan(
  id: string,
  datos: Partial<Omit<Plan, "id" | "codigo_plan" | "created_at">>
): Promise<Plan | null> {
  const patch: Record<string, unknown> = {};
  if (datos.nombre !== undefined) patch.nombre = datos.nombre;
  if (datos.descripcion !== undefined) patch.descripcion = datos.descripcion ?? null;
  if (datos.precio !== undefined) patch.precio = datos.precio;
  if (datos.moneda !== undefined) patch.moneda = datos.moneda;
  if (datos.periodicidad !== undefined) patch.periodicidad = datos.periodicidad;
  if (datos.limite_usuarios !== undefined) patch.limite_usuarios = datos.limite_usuarios ?? null;
  if (datos.limite_clientes !== undefined) patch.limite_clientes = datos.limite_clientes ?? null;
  if (datos.limite_facturas !== undefined) patch.limite_facturas = datos.limite_facturas ?? null;
  if (datos.estado !== undefined) patch.estado = datos.estado;

  const { data, error } = await supabase
    .from("planes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[planes] updatePlan:", error.message);
    return null;
  }
  return rowToPlan(data as PlanRow);
}

/** Cambia el estado del plan. */
export async function toggleEstadoPlan(id: string, estado: EstadoPlan): Promise<void> {
  await updatePlan(id, { estado });
}

/** Elimina un plan. */
export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("planes").delete().eq("id", id);
  if (error) console.error("[planes] deletePlan:", error.message);
}

export function planNombre(p: Plan): string {
  return p.nombre;
}
