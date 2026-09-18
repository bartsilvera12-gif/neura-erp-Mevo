"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calcularOperacion, utilidad } from "@/lib/mercaderia/escala";
import type {
  MercProducto,
  MercStockVendedor,
  MercVendedor,
  TipoVenta,
} from "@/lib/mercaderia/types";

function fmtGs(v: number) {
  return `Gs. ${(Number(v) || 0).toLocaleString("es-PY")}`;
}
function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}

type Linea = { producto_id: string; cantidad: number };

export default function NuevaVentaClient({
  vendedores,
  productos,
  stock,
  forcedVendedorId,
}: {
  vendedores: MercVendedor[];
  productos: MercProducto[];
  stock: MercStockVendedor[];
  forcedVendedorId?: string;
}) {
  const router = useRouter();
  const [vendedorId, setVendedorId] = useState<string>(
    forcedVendedorId ?? vendedores[0]?.id ?? ""
  );
  const [tipo, setTipo] = useState<TipoVenta>("simple");
  const [fecha, setFecha] = useState<string>(todayYmd());
  const [lineas, setLineas] = useState<Linea[]>([{ producto_id: productos[0]?.id ?? "", cantidad: 1 }]);
  const [monto, setMonto] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const productosById = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const stockPorVendedor = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of stock) {
      const inner = map.get(s.vendedor_id) ?? new Map<string, number>();
      inner.set(s.producto_id, Number(s.stock) || 0);
      map.set(s.vendedor_id, inner);
    }
    return map;
  }, [stock]);
  const stockDelVend = vendedorId ? stockPorVendedor.get(vendedorId) : null;

  const op = useMemo(
    () =>
      calcularOperacion(
        tipo,
        lineas.filter((l) => l.producto_id && l.cantidad > 0),
        productosById
      ),
    [tipo, lineas, productosById]
  );
  const util = useMemo(() => utilidad(Number(monto) || 0, op.costo_total, op.comision_total), [monto, op]);

  function addLinea() {
    setLineas([...lineas, { producto_id: productos[0]?.id ?? "", cantidad: 1 }]);
  }
  function removeLinea(idx: number) {
    setLineas(lineas.filter((_, i) => i !== idx));
  }
  function setLinea(idx: number, patch: Partial<Linea>) {
    setLineas(lineas.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function guardar() {
    setError(null);
    setOk(null);
    if (!vendedorId) return setError("Elegí un vendedor.");
    if (!fecha) return setError("Fecha requerida.");
    const m = Number(monto);
    if (!Number.isFinite(m) || m < 0) return setError("Monto inválido.");
    if (m === 0) {
      const ok = window.confirm(
        "El monto cobrado es 0. La utilidad quedará negativa. ¿Registrar igual?"
      );
      if (!ok) return;
    }
    if (op.lineas.length === 0) return setError("Agregá al menos un producto con cantidad.");
    if (tipo === "simple" && op.lineas.length > 1)
      return setError("Venta simple es solo 1 producto. Usá 'Combo' para varios.");
    setBusy(true);
    try {
      const res = await fetch(`/api/mercaderia/ventas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendedor_id: vendedorId,
          tipo,
          fecha,
          monto_total_real: m,
          lineas: op.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
          notas: notas.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOk(`Venta ${j.id?.slice(0, 8)}… registrada.`);
      setLineas([{ producto_id: productos[0]?.id ?? "", cantidad: 1 }]);
      setMonto("");
      setNotas("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Vendedor
              {forcedVendedorId ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
                  {vendedores[0]?.nombre ?? "—"}
                  {vendedores[0]?.zona ? ` — ${vendedores[0].zona}` : ""}
                </div>
              ) : (
                <select
                  value={vendedorId}
                  onChange={(e) => setVendedorId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                >
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                      {v.zona ? ` — ${v.zona}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Tipo
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTipo("simple")}
                  className={`flex-1 rounded px-3 py-1.5 text-sm ${tipo === "simple" ? "bg-[#4FAEB2] text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setTipo("combo")}
                  className={`flex-1 rounded px-3 py-1.5 text-sm ${tipo === "combo" ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Combo
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Fecha
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Productos
            </h4>
            {tipo === "combo" ? (
              <button
                type="button"
                onClick={addLinea}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                + Agregar línea
              </button>
            ) : null}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-left">Escala</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Comisión</th>
                  {tipo === "combo" ? <th className="px-3 py-2"></th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((l, idx) => {
                  const p = productosById.get(l.producto_id);
                  const s = stockDelVend?.get(l.producto_id) ?? 0;
                  const calc = op.lineas.find((c) => c.producto_id === l.producto_id);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2">
                        <select
                          value={l.producto_id}
                          onChange={(e) => setLinea(idx, { producto_id: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          disabled={tipo === "simple" && idx > 0}
                        >
                          {productos.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${l.cantidad > s ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                        {s.toLocaleString("es-PY")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                          value={String(l.cantidad)}
                          onChange={(e) => setLinea(idx, { cantidad: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-700">
                          {calc?.escala_aplicada ?? "—"}
                        </span>
                        {p && !p.tiene_mayorista && calc?.escala_aplicada === "unitario" ? (
                          <div className="mt-0.5 text-[10px] text-slate-400">(sin mayorista)</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmtGs((calc?.costo_unitario_snapshot ?? 0) * l.cantidad)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-amber-700">
                        {fmtGs((calc?.comision_unitaria_snapshot ?? 0) * l.cantidad)}
                      </td>
                      {tipo === "combo" ? (
                        <td className="px-3 py-2 text-right">
                          {lineas.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeLinea(idx)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              ×
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Monto cobrado al cliente (Gs)</span>
            <div className="flex flex-wrap items-stretch gap-2">
              <input
                type="number"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="min-w-[160px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums"
                placeholder={
                  op.precio_referencia_total > 0
                    ? `Sugerido: ${op.precio_referencia_total.toLocaleString("es-PY")}`
                    : "0"
                }
              />
              {op.precio_referencia_total > 0 ? (
                <button
                  type="button"
                  onClick={() => setMonto(String(op.precio_referencia_total))}
                  className="whitespace-nowrap rounded border border-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-[#4FAEB2] hover:bg-[#4FAEB2]/10"
                >
                  Usar {op.precio_referencia_total.toLocaleString("es-PY")}
                </button>
              ) : null}
            </div>
            <span className="text-[11px] text-slate-500">
              Es lo que efectivamente pagó el cliente. Puede ser distinto al precio de referencia si negociaron.
            </span>
          </div>
          <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Notas (opcional)</span>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {ok}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={guardar}
              className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Registrar venta"}
            </button>
          </div>
        </section>
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
        <header className="border-b border-slate-100 px-4 py-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Resumen
          </h4>
        </header>
        <div className="grid grid-cols-2 gap-y-1.5 px-4 py-3 text-sm">
          <span className="text-slate-500">Cantidad total</span>
          <span className="text-right tabular-nums text-slate-800">
            {op.cantidad_total.toLocaleString("es-PY")}
          </span>
          <span className="text-slate-500">Precio ref.</span>
          <span className="text-right tabular-nums text-slate-800">{fmtGs(op.precio_referencia_total)}</span>
          <span className="text-slate-500">Costo total</span>
          <span className="text-right font-semibold tabular-nums text-slate-800">{fmtGs(op.costo_total)}</span>
          <span className="text-slate-500">Comisión total</span>
          <span className="text-right font-semibold tabular-nums text-amber-700">{fmtGs(op.comision_total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-y-1.5 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-sm">
          <span className="text-slate-500">Monto real</span>
          <span className="text-right font-semibold tabular-nums text-slate-900">{fmtGs(Number(monto) || 0)}</span>
          <span className="text-slate-500">Utilidad</span>
          <span
            className={`text-right font-semibold tabular-nums ${util >= 0 ? "text-[#4FAEB2]" : "text-red-600"}`}
          >
            {fmtGs(util)}
          </span>
        </div>
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          {tipo === "combo"
            ? "En combo la escala se aplica según la cantidad total del combo."
            : "En venta simple la escala depende de la cantidad de la línea."}
        </div>
      </aside>
    </div>
  );
}

