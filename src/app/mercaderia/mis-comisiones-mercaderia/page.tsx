import Link from "next/link";
import { redirect } from "next/navigation";
import { getMercRole } from "@/lib/mercaderia/roles";
import { listVendedores, getComisionesMercVendedor } from "@/lib/mercaderia/server-queries";

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
/** `fecha` viene como 'YYYY-MM-DD' (date). Se formatea sin crear Date (evita corrimiento de zona). */
function fmtFecha(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

export default async function MisComisionesMercaderiaPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");

  const sp = await Promise.resolve(searchParams ?? {});
  const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const desdeRaw = pickStr(sp, "desde")?.trim();
  const hastaRaw = pickStr(sp, "hasta")?.trim();
  const desde = isYmd(desdeRaw) ? desdeRaw : undefined;
  const hasta = isYmd(hastaRaw) ? hastaRaw : undefined;

  const esAdmin = role.mode === "admin";
  const vendedorIdSel = esAdmin ? pickStr(sp, "vendedor_id")?.trim() || "" : role.vendedor?.id ?? "";
  const vendedores = esAdmin ? await listVendedores(true) : [];
  const vendedorNombre = esAdmin
    ? vendedores.find((v) => v.id === vendedorIdSel)?.nombre ?? null
    : role.vendedor?.nombre ?? null;

  const rep = vendedorIdSel
    ? await getComisionesMercVendedor({ vendedorId: vendedorIdSel, desde, hasta })
    : null;

  const inputCls =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Mercadería · Comisiones</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {esAdmin ? "Comisiones de mercadería por vendedor" : "Mis comisiones de mercadería"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Comisión acumulada por ventas de mercadería (según la comisión de cada producto)
          {vendedorNombre ? ` · ${vendedorNombre}` : ""}
        </p>
      </div>

      {/* Filtros */}
      <form method="get" className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {esAdmin ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendedor</span>
              <select name="vendedor_id" defaultValue={vendedorIdSel} className={`${inputCls} w-[220px]`}>
                <option value="">— Elegir vendedor —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fecha desde</span>
            <input type="date" name="desde" defaultValue={desde ?? ""} max={hasta ?? undefined} className={`${inputCls} w-[160px]`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fecha hasta</span>
            <input type="date" name="hasta" defaultValue={hasta ?? ""} min={desde ?? undefined} className={`${inputCls} w-[160px]`} />
          </label>
          <button type="submit" className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]">
            Ver
          </button>
          <Link href="/mercaderia/mis-comisiones-mercaderia" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]">
            Limpiar
          </Link>
        </div>
      </form>

      {esAdmin && !vendedorIdSel ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
          Elegí un vendedor para ver sus comisiones.
        </div>
      ) : rep?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{rep.error}</div>
      ) : rep ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#4FAEB2]/45 bg-gradient-to-b from-[#4FAEB2]/10 to-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comisión total acumulada</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#3F8E91]">{gs(rep.totalAcumuladoComision)}</p>
            </div>
            <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comisión del mes actual</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{gs(rep.mesComision)}</p>
            </div>
            <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Comisión del período {desde || hasta ? "seleccionado" : "(todo)"}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{gs(rep.rangoComision)}</p>
              <p className="text-xs text-slate-500">sobre {gs(rep.rangoMonto)} vendidos</p>
            </div>
          </div>

          {/* Detalle */}
          <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Fecha</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Tipo</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Monto venta</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sm text-slate-400">No hay ventas en este período.</td>
                    </tr>
                  ) : (
                    rep.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 text-sm whitespace-nowrap text-slate-700">{fmtFecha(r.fecha)}</td>
                        <td className="px-5 py-3 text-sm text-slate-800">{r.tipo === "combo" ? "Combo" : "Simple"}</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-800">{gs(r.monto_total_real)}</td>
                        <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-[#3F8E91]">{gs(r.comision_total_snapshot)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rep.rows.length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-[#4FAEB2]/5">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-700" colSpan={2}>Total del período</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{gs(rep.rangoMonto)}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-[#3F8E91]">{gs(rep.rangoComision)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
