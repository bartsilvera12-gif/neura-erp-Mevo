"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MercVenta, MercVentaItem } from "@/lib/mercaderia/types";

function fmtGs(v: number | null | undefined) {
  return `Gs. ${(Number(v) || 0).toLocaleString("es-PY")}`;
}

export default function MisVentasClient({
  ventas,
  itemsPorVenta,
}: {
  ventas: MercVenta[];
  itemsPorVenta: Record<string, MercVentaItem[]>;
}) {
  const router = useRouter();
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalMonto = ventas
    .filter((v) => !v.anulada)
    .reduce((s, v) => s + Number(v.monto_total_real || 0), 0);
  const activas = ventas.filter((v) => !v.anulada).length;

  async function anular(v: MercVenta) {
    const motivo = window.prompt(
      `Anular tu venta del ${v.fecha} por ${fmtGs(v.monto_total_real)}?\n\n` +
        "Se te devuelve el stock. La venta queda registrada como anulada.\n\n" +
        "Motivo (opcional):"
    );
    if (motivo === null) return;
    setAnulandoId(v.id);
    setErr(null);
    try {
      const res = await fetch(`/api/mercaderia/ventas/${v.id}/anular`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() || null }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAnulandoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Total {activas} venta{activas === 1 ? "" : "s"} activa{activas === 1 ? "" : "s"}
        </div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
          {fmtGs(totalMonto)}
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-left">Productos</th>
                <th className="px-5 py-2 text-right">Monto</th>
                <th className="px-5 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-500">
                    No tenés ventas registradas.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => {
                  const items = itemsPorVenta[v.id] ?? [];
                  return (
                    <tr
                      key={v.id}
                      className={
                        v.anulada
                          ? "bg-red-50/40 line-through decoration-red-400/60"
                          : "hover:bg-slate-50/60"
                      }
                    >
                      <td className="px-5 py-2 text-slate-700 whitespace-nowrap">
                        {v.fecha}
                        {v.anulada ? (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700 no-underline">
                            Anulada
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase no-underline ${
                            v.tipo === "combo"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {v.tipo}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-slate-700">
                        {items.length === 0
                          ? "—"
                          : items
                              .map((it) => `${it.cantidad} × ${it.producto_nombre ?? "(?)"}`)
                              .join(", ")}
                      </td>
                      <td className="px-5 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                        {fmtGs(v.monto_total_real)}
                      </td>
                      <td className="px-5 py-2 text-right no-underline">
                        {v.anulada ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <button
                            type="button"
                            disabled={anulandoId === v.id}
                            onClick={() => anular(v)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {anulandoId === v.id ? "..." : "Anular"}
                          </button>
                        )}
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
