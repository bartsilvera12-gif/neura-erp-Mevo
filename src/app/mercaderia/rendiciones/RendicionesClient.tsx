"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MercRendicion, MercVendedor } from "@/lib/mercaderia/types";

function fmtGs(v: number | null | undefined) {
  return `${(Number(v) || 0).toLocaleString("es-PY")} ₲`;
}
function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}

export default function RendicionesClient({
  vendedores,
  rendiciones,
}: {
  vendedores: MercVendedor[];
  rendiciones: MercRendicion[];
}) {
  const router = useRouter();
  const [vendedorId, setVendedorId] = useState<string>(vendedores[0]?.id ?? "");
  const [fecha, setFecha] = useState<string>(todayYmd());
  const [montoRendido, setMontoRendido] = useState<string>("");
  const [comisionPagada, setComisionPagada] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setOk(null);
    if (!vendedorId) return setError("Elegí un vendedor.");
    setBusy(true);
    try {
      const res = await fetch(`/api/mercaderia/rendiciones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendedor_id: vendedorId,
          fecha,
          monto_rendido: Number(montoRendido) || 0,
          comision_pagada: Number(comisionPagada) || 0,
          notas: notas.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOk("Rendición registrada.");
      setMontoRendido("");
      setComisionPagada("");
      setNotas("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          Nueva rendición
        </h4>
        <div className="mt-3 space-y-2">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Vendedor
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Monto rendido (Gs)
            <input
              type="number"
              min={0}
              value={montoRendido}
              onChange={(e) => setMontoRendido(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums"
              placeholder="0"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Comisión pagada al vendedor (Gs)
            <input
              type="number"
              min={0}
              value={comisionPagada}
              onChange={(e) => setComisionPagada(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums"
              placeholder="0"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Notas
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {ok}
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={guardar}
            className="mt-2 w-full rounded-xl bg-[#4FAEB2] py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Registrar rendición"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Histórico
          </h4>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-5 py-2 text-left">Vendedor</th>
                <th className="px-5 py-2 text-right">Monto rendido</th>
                <th className="px-5 py-2 text-right">Comisión pagada</th>
                <th className="px-5 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rendiciones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-500">
                    No hay rendiciones aún.
                  </td>
                </tr>
              ) : (
                rendiciones.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-2">{r.fecha}</td>
                    <td className="px-5 py-2">{r.vendedor_nombre ?? "—"}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtGs(r.monto_rendido)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-amber-700">{fmtGs(r.comision_pagada)}</td>
                    <td className="px-5 py-2 text-slate-500">{r.notas ?? "—"}</td>
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
