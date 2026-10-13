/**
 * Origen de una venta de mercadería (marcado con un clic por el vendedor).
 * Publicidad (Meta Ads = Facebook/Instagram, TikTok) vs Habitual/Local
 * (cliente antiguo / venta física). Sin `server-only`: lo usa el formulario
 * (client) y el reporte (server).
 */

export type MercOrigenValue = "meta" | "tiktok" | "cliente_antiguo" | "fisica_organica";
export type MercOrigenGrupo = "publicidad" | "habitual";

export const MERC_ORIGENES: ReadonlyArray<{
  value: MercOrigenValue;
  label: string;
  grupo: MercOrigenGrupo;
  icon: string;
}> = [
  { value: "meta", label: "Meta Ads", grupo: "publicidad", icon: "📣" },
  { value: "tiktok", label: "TikTok", grupo: "publicidad", icon: "🎵" },
  { value: "cliente_antiguo", label: "Cliente antiguo", grupo: "habitual", icon: "🔁" },
  { value: "fisica_organica", label: "Venta física / orgánica", grupo: "habitual", icon: "🏪" },
];

/**
 * Normaliza el valor recibido. Mapea los valores viejos facebook/instagram a
 * `meta` (eran lo mismo: anuncios de Meta).
 */
export function normalizeOrigen(v: unknown): MercOrigenValue | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "facebook" || s === "instagram") return "meta";
  const hit = MERC_ORIGENES.find((o) => o.value === s);
  return hit ? hit.value : null;
}

export function origenLabel(v: string | null | undefined): string {
  const o = MERC_ORIGENES.find((x) => x.value === v);
  if (o) return o.label;
  if (v === "facebook" || v === "instagram") return "Meta Ads";
  return "Sin especificar";
}

export function origenIcon(v: string | null | undefined): string {
  const o = MERC_ORIGENES.find((x) => x.value === v);
  if (o) return o.icon;
  if (v === "facebook" || v === "instagram") return "📣";
  return "❓";
}

/** True para orígenes de publicidad paga (incluye valores viejos fb/ig). */
export function esPublicidad(v: string | null | undefined): boolean {
  return v === "meta" || v === "tiktok" || v === "facebook" || v === "instagram";
}
