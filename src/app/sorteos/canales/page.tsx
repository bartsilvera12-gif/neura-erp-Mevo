import Link from "next/link";
import {
  fetchSorteosListServer,
  pickDefaultSorteoId,
} from "@/lib/sorteos/server-queries";
import { fetchVentasPorCanalServer, type CanalVenta } from "@/lib/sorteos/ventas-por-canal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

function pickStr(sp: Sp, key: string): string | undefined {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return undefined;
}

function fmtGs(n: number) {
  return `${(Number(n) || 0).toLocaleString("es-PY")} ₲`;
}
function fmtNum(n: number) {
  return (Number(n) || 0).toLocaleString("es-PY");
}

const tabClass =
  "rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700";

/** Estilo e ícono por canal. */
function canalStyle(canal: string): { icon: string; chip: string } {
  if (canal === "Facebook") return { icon: "📘", chip: "bg-blue-50 text-blue-700 border-blue-200" };
  if (canal === "Instagram") return { icon: "📸", chip: "bg-pink-50 text-pink-700 border-pink-200" };
  if (canal === "TikTok") return { icon: "🎵", chip: "bg-slate-100 text-slate-600 border-slate-200" };
  if (canal.startsWith("Sin anuncio")) return { icon: "🔗", chip: "bg-slate-50 text-slate-600 border-slate-200" };
  return { icon: "📢", chip: "bg-amber-50 text-amber-700 border-amber-200" };
}

export default async function SorteoCanalesPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const sorteoId = pickStr(sp, "sorteo_id")?.trim() || undefined;

  const { sorteos } = await fetchSorteosListServer();
  const defaultSorteoId = pickDefaultSorteoId(sorteos);
  const selectedSorteoId = sorteoId === "all" ? null : sorteoId ?? defaultSorteoId ?? null;
  const selectValue = sorteoId === "all" ? "all" : sorteoId ?? defaultSorteoId ?? "all";

  const { data: rows, error } = await fetchVentasPorCanalServer(selectedSorteoId);

  // Facebook/Instagram arriba; "Sin anuncio" al final. TikTok se muestra siempre (aunque sea 0).
  const orden = (c: CanalVenta) => {
    if (c.canal === "Facebook") return 0;
    if (c.canal === "Instagram") return 1;
    if (c.canal === "TikTok") return 2;
    if (c.canal.startsWith("Sin anuncio")) return 9;
    return 5;
  };
  const sorted = [...rows].sort((a, b) => orden(a) - orden(b) || b.monto - a.monto);
  const tieneTikTok = rows.some((r) => r.canal === "TikTok");
  const display: CanalVenta[] = tieneTikTok
    ? sorted
    : [...sorted.filter((c) => c.canal !== "TikTok")];
  // Insertar fila TikTok (0 / no rastreado) después de Instagram si no vino.
  if (!tieneTikTok) {
    const idx = display.findIndex((c) => c.canal.startsWith("Sin anuncio"));
    const tk: CanalVenta = { canal: "TikTok", pedidos: 0, boletas: 0, monto: 0, ticket_promedio: 0 };
    if (idx >= 0) display.splice(idx, 0, tk);
    else display.push(tk);
  }

  const fb = rows.find((r) => r.canal === "Facebook");
  const ig = rows.find((r) => r.canal === "Instagram");
  const totalMetaPedidos = (fb?.pedidos ?? 0) + (ig?.pedidos ?? 0);
  const totalMetaMonto = (fb?.monto ?? 0) + (ig?.monto ?? 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/sorteos" className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]">
          Sorteos
        </Link>
        <span aria-hidden className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Canales</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Sorteos · Canales
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Ventas por canal de publicidad</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compará de dónde vienen las ventas: Facebook, Instagram y otros
        </p>
      </div>

      {/* Tabs */}
      <div className="flex w-full flex-wrap gap-1 rounded-2xl border border-[#4FAEB2]/45 bg-white p-1.5 shadow-sm sm:w-fit">
        <Link href="/sorteos" className={tabClass}>Sorteos</Link>
        <Link href="/sorteos/entradas" className={tabClass}>Entradas</Link>
        <Link href="/sorteos/cupones" className={tabClass}>Cupones</Link>
        <Link href="/sorteos/tickets" className={tabClass}>Tickets</Link>
        <Link href="/sorteos/ganador" className={tabClass}>Ganador</Link>
        <span className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#4FAEB2]/30">
          Canales
        </span>
      </div>

      {/* Filtro de sorteo */}
      <form method="get" className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sorteo</span>
            <select
              name="sorteo_id"
              defaultValue={selectValue}
              className="w-[280px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              {sorteos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.estado === "activo" ? " (activo)" : ""}
                </option>
              ))}
              <option value="all">Todos los sorteos</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Ver reporte
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {/* Tabla de canales */}
      {!error ? (
        <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Canal</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Pedidos</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Boletas</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Monto</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Ticket prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {display.map((c) => {
                  const st = canalStyle(c.canal);
                  const esTikTok0 = c.canal === "TikTok" && c.pedidos === 0;
                  return (
                    <tr key={c.canal} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3 text-sm">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
                          <span aria-hidden>{st.icon}</span>
                          {c.canal}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-800">
                        {esTikTok0 ? "—" : fmtNum(c.pedidos)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-800">
                        {esTikTok0 ? "—" : fmtNum(c.boletas)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                        {esTikTok0 ? "no rastreado" : fmtGs(c.monto)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                        {esTikTok0 ? "—" : fmtGs(c.ticket_promedio)}
                      </td>
                    </tr>
                  );
                })}
                {display.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                      No hay ventas con monto para este sorteo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {totalMetaPedidos > 0 ? (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-[#4FAEB2]/5">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-700">Total anuncios Meta (FB + IG)</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{fmtNum(totalMetaPedidos)}</td>
                    <td className="px-5 py-3"></td>
                    <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{fmtGs(totalMetaMonto)}</td>
                    <td className="px-5 py-3"></td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      ) : null}

      {/* Notas */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-900">
        <p className="font-semibold">⚠️ Sobre TikTok</p>
        <p className="mt-1 leading-relaxed">
          TikTok no usa el “click-to-WhatsApp” de Meta, así que <strong>no envía la información de origen</strong> y
          sus ventas no se pueden identificar (aparecen dentro de “Sin anuncio”). Para medir TikTok a futuro, usá en
          los anuncios de TikTok un enlace de WhatsApp con una palabra clave distinta.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          Cómo se mide: se toma el anuncio por el que la persona escribió por primera vez (Facebook/Instagram).
          Se cuentan ventas con monto mayor a 0, sin las anuladas. “Sin anuncio” incluye ventas directas, por
          revendedores y recompras, por eso los números de Facebook/Instagram son un piso del impacto publicitario.
        </p>
      </div>
    </div>
  );
}
