import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import { fetchStockInversionReport } from "@/lib/mercaderia/stock-inversion";

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
function num(n: number) {
  return (Number(n) || 0).toLocaleString("es-PY");
}

export default async function StockInversionPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  await requireAdminOrRedirect();

  const sp = await Promise.resolve(searchParams ?? {});
  const vendedorId = pickStr(sp, "vendedor_id")?.trim() || undefined;
  const productoId = pickStr(sp, "producto_id")?.trim() || undefined;

  const rep = await fetchStockInversionReport({
    vendedorId: vendedorId && vendedorId !== "all" ? vendedorId : null,
    productoId: productoId && productoId !== "all" ? productoId : null,
  });

  const exportQs = new URLSearchParams();
  if (vendedorId && vendedorId !== "all") exportQs.set("vendedor_id", vendedorId);
  if (productoId && productoId !== "all") exportQs.set("producto_id", productoId);
  const exportBase = `/api/mercaderia/stock-inversion/export?${exportQs.toString()}`;
  const excelHref = `${exportBase}${exportQs.toString() ? "&" : ""}formato=excel`;
  const pdfHref = `${exportBase}${exportQs.toString() ? "&" : ""}formato=pdf`;

  const alcance = rep.vendedorNombre ? `Vendedor: ${rep.vendedorNombre}` : "Stock general (todos los vendedores)";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Mercadería · Stock e inversión
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Stock de mercadería e inversión</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inversión calculada al <strong>costo</strong> (stock × costo unitario) · {alcance}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={excelHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
          >
            📊 Exportar Excel
          </a>
          <a
            href={pdfHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-100"
          >
            📄 Exportar PDF
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cantidad total de mercaderías</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{num(rep.totalUnidades)}</p>
          <p className="text-xs text-slate-500">unidades disponibles</p>
        </div>
        <div className="rounded-2xl border border-[#4FAEB2]/45 bg-gradient-to-b from-[#4FAEB2]/10 to-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total invertido en stock</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#3F8E91]">{gs(rep.totalInversion)}</p>
          <p className="text-xs text-slate-500">valuado al costo</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="get" className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendedor (sucursal)</span>
            <select
              name="vendedor_id"
              defaultValue={vendedorId ?? "all"}
              className="w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              <option value="all">General (todos)</option>
              {rep.vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                  {v.zona ? ` — ${v.zona}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Producto</span>
            <select
              name="producto_id"
              defaultValue={productoId ?? "all"}
              className="w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              <option value="all">Todos los productos</option>
              {rep.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Filtrar
          </button>
          <Link
            href="/mercaderia/stock-inversion"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Producto</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Stock actual</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Costo unitario</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Inversión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rep.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                    No hay stock disponible para este filtro.
                  </td>
                </tr>
              ) : (
                rep.rows.map((r) => (
                  <tr key={r.producto_id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">{r.producto_nombre}</td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-800">{num(r.stock)}</td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-600">{gs(r.costo_unitario)}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{gs(r.inversion)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rep.rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-[#4FAEB2]/5">
                  <td className="px-5 py-3 text-sm font-semibold text-slate-700">TOTAL</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{num(rep.totalUnidades)}</td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-[#3F8E91]">{gs(rep.totalInversion)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        La inversión se calcula con el <strong>costo</strong> del producto (no el precio de venta). El stock corresponde a la
        mercadería en poder de los vendedores. Reporte visible solo para administradores.
      </p>
    </div>
  );
}
