import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getKpisPorVendedor,
  listVentas,
  listVendedores,
} from "@/lib/mercaderia/server-queries";
import { getMercRole } from "@/lib/mercaderia/roles";

function ymd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}
function today() {
  return ymd(new Date());
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}
function fmtGs(v: number | null | undefined) {
  return `${(Number(v) || 0).toLocaleString("es-PY")} ₲`;
}

export default async function MercaderiaDashboardPage() {
  const role = await getMercRole();
  if (role.mode === "vendedor") redirect("/mercaderia/mi-stock");
  if (role.mode === "none") redirect("/");
  const hoy = today();
  const inicioSemana = daysAgo(6); // últimos 7 días
  const inicioMes = daysAgo(29); // últimos 30 días

  const [kpisHoy, kpisSemana, kpisMes, vendedores, ventasRecientes] = await Promise.all([
    getKpisPorVendedor(hoy, hoy),
    getKpisPorVendedor(inicioSemana, hoy),
    getKpisPorVendedor(inicioMes, hoy),
    listVendedores(true),
    listVentas({ limit: 15 }),
  ]);

  const sum = (rows: Awaited<ReturnType<typeof getKpisPorVendedor>>, k: keyof (typeof rows)[number]) =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  const totalHoy = { monto: sum(kpisHoy, "monto_total"), utilidad: sum(kpisHoy, "utilidad_total"), ventas: sum(kpisHoy, "ventas_cantidad") };
  const totalSem = { monto: sum(kpisSemana, "monto_total"), utilidad: sum(kpisSemana, "utilidad_total"), ventas: sum(kpisSemana, "ventas_cantidad") };
  const totalMes = { monto: sum(kpisMes, "monto_total"), utilidad: sum(kpisMes, "utilidad_total"), ventas: sum(kpisMes, "ventas_cantidad") };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Ventas hoy" boletas={totalHoy.ventas} monto={totalHoy.monto} utilidad={totalHoy.utilidad} />
        <KpiCard label="Últimos 7 días" boletas={totalSem.ventas} monto={totalSem.monto} utilidad={totalSem.utilidad} />
        <KpiCard label="Últimos 30 días" boletas={totalMes.ventas} monto={totalMes.monto} utilidad={totalMes.utilidad} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Rendimiento por vendedor (últimos 30 días)
          </h2>
          <Link href="/mercaderia/vendedores" className="text-xs text-[#4FAEB2] hover:underline">
            Ver vendedores →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Vendedor</th>
                <th className="px-5 py-2 text-right">Ventas</th>
                <th className="px-5 py-2 text-right">Monto vendido</th>
                <th className="px-5 py-2 text-right">Comisión</th>
                <th className="px-5 py-2 text-right">Utilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendedores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-500">
                    No hay vendedores todavía.
                  </td>
                </tr>
              ) : (
                vendedores.map((v) => {
                  const k = kpisMes.find((r) => r.vendedor_id === v.id);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-2.5">
                        <Link href={`/mercaderia/vendedores/${v.id}`} className="font-medium text-slate-800 hover:text-[#4FAEB2] hover:underline">
                          {v.nombre}
                        </Link>
                        {v.zona ? <div className="text-[11px] text-slate-500">{v.zona}</div> : null}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{k?.ventas_cantidad ?? 0}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{fmtGs(k?.monto_total)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-amber-700">{fmtGs(k?.comision_total)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-[#4FAEB2]">{fmtGs(k?.utilidad_total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Últimas ventas
          </h2>
          <Link href="/mercaderia/ventas" className="text-xs text-[#4FAEB2] hover:underline">Ver todas →</Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Vendedor</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-right">Monto</th>
                <th className="px-5 py-2 text-right">Comisión</th>
                <th className="px-5 py-2 text-right">Utilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventasRecientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-slate-500">
                    Todavía no hay ventas registradas.
                  </td>
                </tr>
              ) : (
                ventasRecientes.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-2.5 text-slate-700">{v.fecha}</td>
                    <td className="px-5 py-2.5 text-slate-800">{v.vendedor_nombre ?? "—"}</td>
                    <td className="px-5 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${v.tipo === "combo" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                        {v.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmtGs(v.monto_total_real)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-amber-700">{fmtGs(v.comision_total_snapshot)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-[#4FAEB2]">{fmtGs(v.utilidad_snapshot)}</td>
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

function KpiCard({
  label,
  boletas,
  monto,
  utilidad,
}: {
  label: string;
  boletas: number;
  monto: number;
  utilidad: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{fmtGs(monto)}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {boletas} venta{boletas === 1 ? "" : "s"}
        </span>
        <span className="text-[#4FAEB2] font-semibold">Utilidad: {fmtGs(utilidad)}</span>
      </div>
    </div>
  );
}
