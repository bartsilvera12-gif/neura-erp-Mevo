/**
 * Origen de una venta de mercadería (marcado con un clic por el vendedor).
 * Publicidad (Facebook/Instagram) vs Habitual/Local (cliente antiguo / física).
 * Sin `server-only`: lo usa el formulario (client) y el reporte (server).
 */

export type MercOrigenValue = "facebook" | "instagram" | "cliente_antiguo" | "fisica_organica";
export type MercOrigenGrupo = "publicidad" | "habitual";

export const MERC_ORIGENES: ReadonlyArray<{
  value: MercOrigenValue;
  label: string;
  grupo: MercOrigenGrupo;
  icon: string;
}> = [
  { value: "facebook", label: "Facebook", grupo: "publicidad", icon: "📘" },
  { value: "instagram", label: "Instagram", grupo: "publicidad", icon: "📸" },
  { value: "cliente_antiguo", label: "Cliente antiguo", grupo: "habitual", icon: "🔁" },
  { value: "fisica_organica", label: "Venta física / orgánica", grupo: "habitual", icon: "🏪" },
];

export function normalizeOrigen(v: unknown): MercOrigenValue | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const hit = MERC_ORIGENES.find((o) => o.value === s);
  return hit ? hit.value : null;
}

export function origenLabel(v: string | null | undefined): string {
  const o = MERC_ORIGENES.find((x) => x.value === v);
  return o ? o.label : "Sin especificar";
}

export function origenIcon(v: string | null | undefined): string {
  const o = MERC_ORIGENES.find((x) => x.value === v);
  return o ? o.icon : "❓";
}

export function esPublicidad(v: string | null | undefined): boolean {
  return v === "facebook" || v === "instagram";
}
