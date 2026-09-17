import { redirect } from "next/navigation";
import { getVentaConItems, listVentas } from "@/lib/mercaderia/server-queries";
import { getMercRole } from "@/lib/mercaderia/roles";
import type { MercVenta, MercVentaItem } from "@/lib/mercaderia/types";

function fmtGs(v: number | null | undefined) {
  return `${(Number(v) || 0).toLocaleString("es-PY")} ₲`;
}

export default async function MisVentasPage() {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");
  if (role.mode === "admin") redirect("/mercaderia/ventas");

  const ventas = await listVentas({ vendedorId: role.vendedor.id, limit: 300 });
  const itemsPorVenta = await cargarItems(ventas);

  const totalMonto = ventas.reduce((s, v) => s + Number(v.monto_total_real || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Total últimas {ventas.length} ventas
        </div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{fmtGs(totalMonto)}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-left">Productos</th>
                <th className="px-5 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-500">
                    No tenés ventas registradas.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => {
                  const items = itemsPorVenta.get(v.id) ?? [];
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2 text-slate-700 whitespace-nowrap">{v.fecha}</td>
                      <td className="px-5 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${v.tipo === "combo" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                          {v.tipo}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-slate-700">
                        {items.length === 0
                          ? "—"
                          : items.map((it: MercVentaItem) => `${it.cantidad} × ${it.producto_nombre ?? "(?)"}`).join(", ")}
                      </td>
                      <td className="px-5 py-2 text-right font-semibold tabular-nums">
                        {fmtGs(v.monto_total_real)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function cargarItems(ventas: MercVenta[]): Promise<Map<string, MercVentaItem[]>> {
  const map = new Map<string, MercVentaItem[]>();
  const ids = ventas.slice(0, 50).map((v) => v.id);
  await Promise.all(
    ids.map(async (id) => {
      const r = await getVentaConItems(id);
      if (r) map.set(id, r.items);
    })
  );
  return map;
}
