/**
 * Límites de día y mes calendario en America/Asuncion (PY, UTC−4 fijo),
 * expresados en ISO UTC para filtrar columnas timestamptz en Postgres.
 */

export function asuncionDayBoundsUtc(now = new Date()): { start: string; end: string } {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  const start = new Date(`${ymd}T00:00:00-04:00`);
  const end = new Date(`${ymd}T23:59:59.999-04:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Convierte un día calendario 'YYYY-MM-DD' de Asunción al instante UTC de su
 * medianoche (00:00 -04:00). Devuelve null si el string no es una fecha válida.
 */
export function asuncionDateStartUtc(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00-04:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Instante UTC del inicio del día SIGUIENTE a 'YYYY-MM-DD' (Asunción). Pensado
 * para usar con el operador `<`, de modo que el rango [desde, hasta] sea
 * inclusivo del día "hasta" completo.
 */
export function asuncionDateEndExclusiveUtc(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00-04:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function asuncionMonthBoundsUtc(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const monthNum = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(`${y}-${String(monthNum).padStart(2, "0")}-01T00:00:00-04:00`);
  const nextY = monthNum === 12 ? y + 1 : y;
  const nextM = monthNum === 12 ? 1 : monthNum + 1;
  const end = new Date(
    `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00-04:00`
  );
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
