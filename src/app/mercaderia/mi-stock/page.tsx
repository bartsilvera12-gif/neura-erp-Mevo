import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getKpisPorVendedor,
  listStockPorVendedor,
  listVentas,
} from "@/lib/mercaderia/server-queries";
import { getMercRole } from "@/lib/mercaderia/roles";

function fmtGs(v: number | null | undefined) {
  return `${(Number(v) || 0).toLocaleString("es-PY")} ₲`;
}
function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("es-CA", { timeZone: "America/Asuncion" });
}

export default async function MiStockPage() {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");
  if (role.mode === "admin") redirect("/mercaderia");

  const vendedorId = role.vendedor.id;
  const hoy = todayYmd();
  const inicioSem = daysAgo(6);
  const inicioMes = daysAgo(29);

  const [stock, kpiHoy, kpiSem, kpiMes, ultimasVentas] = await Promise.all([
    listStockPorVendedor(vendedorId),
    getKpisPorVendedor(hoy, hoy),
    getKpisPorVendedor(inicioSem, hoy),
    getKpisPorVendedor(inicioMes, hoy),
    listVentas({ vendedorId, limit: 15 }),
  ]);

  const kHoy = kpiHoy.find((k) => k.vendedor_id === vendedorId);
  const kSem = kpiSem.find((k) => k.vendedor_id === vendedorId);
  const kMes = kpiMes.find((k) => k.vendedor_id === vendedorId);
  const stockPositivo = stock.filter((s) => s.stock > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">
              Hola
            </div>
            <h2 className="text-xl font-semibold text-slate-900">{role.vendedor.nombre}</h2>
            {role.vendedor.zona ? (
              <div className="text-xs text-slate-500">{role.vendedor.zona}</div>
            ) : null}
          </div>
          <Link
            href="/mercaderia/nueva-venta"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
          >
            + Registrar venta
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Ventas hoy" cantidad={kHoy?.ventas_cantidad ?? 0} monto={kHoy?.monto_total ?? 0} />
        <Kpi label="Últimos 7 días" cantidad={kSem?.ventas_cantidad ?? 0} monto={kSem?.monto_total ?? 0} />
        <Kpi label="Últimos 30 días" cantidad={kMes?.ventas_cantidad ?? 0} monto={kMes?.monto_total ?? 0} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Mi stock
          </h3>
          <span className="text-[11px] text-slate-500">
            {stockPositivo.length} producto{stockPositivo.length === 1 ? "" : "s"} con stock
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Producto</th>
                <th className="px-5 py-2 text-right">Stock disponible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockPositivo.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-6 text-center text-sm text-slate-500">
                    No tenés stock cargado todavía.
                  </td>
                </tr>
              ) : (
                stockPositivo.map((s) => (
                  <tr key={s.producto_id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-2 text-slate-800">{s.producto_nombre}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {s.stock.toLocaleString("es-PY")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Mis últimas ventas
          </h3>
          <Link href="/mercaderia/mis-ventas" className="text-xs text-[#4FAEB2] hover:underline">
            Ver todas →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ultimasVentas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-500">
                    No registraste ventas todavía.
                  </td>
                </tr>
              ) : (
                ultimasVentas.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-2 text-slate-700">{v.fecha}</td>
                    <td className="px-5 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${v.tipo === "combo" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                        {v.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums font-semibold">{fmtGs(v.monto_total_real)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, cantidad, monto }: { label: string; cantidad: number; monto: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{fmtGs(monto)}</div>
      <div className="mt-1 text-xs text-slate-500">
        {cantidad} venta{cantidad === 1 ? "" : "s"}
      </div>
    </div>
  );
}
