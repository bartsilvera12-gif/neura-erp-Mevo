"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MercVendedor, MercVenta } from "@/lib/mercaderia/types";

function fmtGs(v: number | null | undefined) {
  return `Gs. ${(Number(v) || 0).toLocaleString("es-PY")}`;
}

type Filtros = {
  vendedorId: string | null;
  desde: string | null;
  hasta: string | null;
  tipo: "simple" | "combo" | null;
  anuladas: "excluir" | "solo_anuladas" | "incluir";
};

export default function VentasClient({
  vendedores,
  ventas,
  filtros,
}: {
  vendedores: MercVendedor[];
  ventas: MercVenta[];
  filtros: Filtros;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function apply(patch: Partial<Filtros>) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    for (const [k, v] of Object.entries(patch)) {
      const key = k === "vendedorId" ? "vendedor" : k;
      if (v == null || v === "" || v === "excluir") params.delete(key);
      else params.set(key, String(v));
    }
    router.push(`/mercaderia/ventas${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function anular(v: MercVenta) {
    const motivo = window.prompt(
      `Anular venta del ${v.fecha} de ${v.vendedor_nombre ?? "—"} por ${fmtGs(v.monto_total_real)}?\n\n` +
        "Se devolverá el stock al vendedor. La venta queda registrada como anulada.\n\n" +
        "Motivo (opcional):"
    );
    if (motivo === null) return; // Cancel
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
      setErr(e instanceof Error ? e.message : "Error al anular");
    } finally {
      setAnulandoId(null);
    }
  }

  const totales = useMemo(() => {
    let monto = 0;
    let comision = 0;
    let utilidad = 0;
    let activas = 0;
    for (const v of ventas) {
      if (v.anulada) continue;
      monto += Number(v.monto_total_real) || 0;
      comision += Number(v.comision_total_snapshot) || 0;
      utilidad += Number(v.utilidad_snapshot) || 0;
      activas += 1;
    }
    return { monto, comision, utilidad, cantidad: activas };
  }, [ventas]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-5">
          <select
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={filtros.vendedorId ?? ""}
            onChange={(e) => apply({ vendedorId: e.target.value || null })}
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={filtros.desde ?? ""}
            onChange={(e) => apply({ desde: e.target.value || null })}
          />
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={filtros.hasta ?? ""}
            onChange={(e) => apply({ hasta: e.target.value || null })}
          />
          <select
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={filtros.tipo ?? ""}
            onChange={(e) => apply({ tipo: (e.target.value as "simple" | "combo") || null })}
          >
            <option value="">Todos los tipos</option>
            <option value="simple">Simples</option>
            <option value="combo">Combos</option>
          </select>
          <select
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={filtros.anuladas}
            onChange={(e) => apply({ anuladas: e.target.value as Filtros["anuladas"] })}
          >
            <option value="excluir">Solo activas</option>
            <option value="incluir">Incluir anuladas</option>
            <option value="solo_anuladas">Solo anuladas</option>
          </select>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="Ventas activas" value={totales.cantidad.toString()} />
        <MiniStat label="Monto vendido" value={fmtGs(totales.monto)} />
        <MiniStat label="Comisión" value={fmtGs(totales.comision)} color="text-amber-700" />
        <MiniStat label="Utilidad" value={fmtGs(totales.utilidad)} color="text-[#4FAEB2]" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Vendedor</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-right">Monto</th>
                <th className="px-5 py-2 text-right">Costo</th>
                <th className="px-5 py-2 text-right">Comisión</th>
                <th className="px-5 py-2 text-right">Utilidad</th>
                <th className="px-5 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-sm text-slate-500">
                    Sin ventas para estos filtros.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => (
                  <tr
                    key={v.id}
                    className={
                      v.anulada
                        ? "bg-red-50/40 line-through decoration-red-400/60"
                        : "hover:bg-slate-50/60"
                    }
                  >
                    <td className="px-5 py-2 text-slate-700 whitespace-nowrap">{v.fecha}</td>
                    <td className="px-5 py-2 text-slate-800">
                      {v.vendedor_nombre ?? "—"}
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
                    <td className="px-5 py-2 text-right tabular-nums whitespace-nowrap">
                      {fmtGs(v.monto_total_real)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">
                      {fmtGs(v.costo_total_snapshot)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-amber-700 whitespace-nowrap">
                      {fmtGs(v.comision_total_snapshot)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums font-semibold text-[#4FAEB2] whitespace-nowrap">
                      {fmtGs(v.utilidad_snapshot)}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
