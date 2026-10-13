import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import { fetchVentasPorOrigen } from "@/lib/mercaderia/ventas-por-origen";
import { MERC_ORIGENES } from "@/lib/mercaderia/origen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;
function pickStr(sp: Sp, key: string): string | undefined {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return undefined;
}
function gs(n: number) {
  return `${(Number(n) || 0).toLocaleString("es-PY")} ₲`;
}

export default async function VentasPorOrigenPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  await requireAdminOrRedirect();

  const sp = await Promise.resolve(searchParams ?? {});
  const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const desdeRaw = pickStr(sp, "desde")?.trim();
  const hastaRaw = pickStr(sp, "hasta")?.trim();
  const desde = isYmd(desdeRaw) ? desdeRaw : undefined;
  const hasta = isYmd(hastaRaw) ? hastaRaw : undefined;

  const rep = await fetchVentasPorOrigen({ desde, hasta });

  const inputCls =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Mercadería · Origen de ventas</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Ventas por origen</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuánto vendió cada vendedor por publicidad vs. clientes habituales/del local
        </p>
      </div>

      {/* Filtros */}
      <form method="get" className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fecha desde</span>
            <input type="date" name="desde" defaultValue={desde ?? ""} max={hasta ?? undefined} className={`${inputCls} w-[160px]`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fecha hasta</span>
            <input type="date" name="hasta" defaultValue={hasta ?? ""} min={desde ?? undefined} className={`${inputCls} w-[160px]`} />
          </label>
          <button type="submit" className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]">Ver</button>
          <Link href="/mercaderia/ventas-por-origen" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]">Limpiar</Link>
        </div>
      </form>

      {rep.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{rep.error}</div>
      ) : (
        <>
          {/* Comparación principal */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#4FAEB2]/45 bg-gradient-to-b from-[#4FAEB2]/10 to-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">📣 Ventas por publicidad</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#3F8E91]">{gs(rep.totalPublicidad)}</p>
              <p className="text-xs text-slate-500">Facebook + Instagram</p>
            </div>
            <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">🏪 Habitual / local</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{gs(rep.totalHabitual)}</p>
              <p className="text-xs text-slate-500">Clientes antiguos + física/orgánica + sin especificar</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total general</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{gs(rep.totalGeneral)}</p>
              <p className="text-xs text-slate-500">{rep.totalVentas} ventas</p>
            </div>
          </div>

          {/* Detalle por vendedor */}
          <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Vendedor</th>
                    {MERC_ORIGENES.map((o) => (
                      <th key={o.value} className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        {o.icon} {o.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-[#3F8E91]">Publicidad</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.rows.length === 0 ? (
                    <tr>
                      <td colSpan={MERC_ORIGENES.length + 3} className="py-12 text-center text-sm text-slate-400">
                        No hay ventas en este período.
                      </td>
                    </tr>
                  ) : (
                    rep.rows.map((r) => (
                      <tr key={r.vendedor_id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 text-sm font-medium text-slate-800">{r.vendedor}</td>
                        {MERC_ORIGENES.map((o) => (
                          <td key={o.value} className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                            {r.porOrigen[o.value] ? gs(r.porOrigen[o.value]) : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#3F8E91]">{r.publicidad ? gs(r.publicidad) : "—"}</td>
                        <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{gs(r.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            El origen lo marca el vendedor al registrar la venta. “Habitual/local” incluye clientes antiguos, ventas físicas/orgánicas
            y las que quedaron sin especificar. Este reporte complementa el de “Canales” de sorteos (ventas por WhatsApp).
          </p>
        </>
      )}
    </div>
  );
}
