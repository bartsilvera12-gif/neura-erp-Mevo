"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MercProducto, MercStockVendedor, MercVendedor } from "@/lib/mercaderia/types";

function fmtInt(n: number) {
  return (Number(n) || 0).toLocaleString("es-PY");
}

export default function VendedoresClient({
  vendedores,
  productos,
  stock,
}: {
  vendedores: MercVendedor[];
  productos: MercProducto[];
  stock: MercStockVendedor[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(vendedores[0]?.id ?? null);
  const [asignaciones, setAsignaciones] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notas, setNotas] = useState("");
  const [modo, setModo] = useState<"asignar" | "retirar">("asignar");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nuevoVend, setNuevoVend] = useState({ nombre: "", zona: "", user_id: "" });

  const stockPorVendedor = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of stock) {
      const inner = map.get(s.vendedor_id) ?? new Map<string, number>();
      inner.set(s.producto_id, Number(s.stock) || 0);
      map.set(s.vendedor_id, inner);
    }
    return map;
  }, [stock]);

  const vendSel = useMemo(() => vendedores.find((v) => v.id === selected) ?? null, [vendedores, selected]);
  const stockDelVend = selected ? stockPorVendedor.get(selected) : null;

  async function guardarAsignaciones() {
    if (!selected) {
      setError("Elegí un vendedor.");
      return;
    }
    const lineas = Object.entries(asignaciones)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad: Number(cantidad) || 0 }))
      .filter((l) => l.cantidad > 0);
    if (lineas.length === 0) {
      setError("Poné al menos una cantidad.");
      return;
    }
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/mercaderia/asignaciones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendedor_id: selected,
          lineas,
          retirar: modo === "retirar",
          notas: notas.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOk(`${modo === "retirar" ? "Retirado" : "Asignado"} ${lineas.length} producto(s).`);
      setAsignaciones({});
      setNotas("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function crearVendedor() {
    if (!nuevoVend.nombre.trim()) {
      setError("Poné un nombre.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/mercaderia/vendedores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: nuevoVend.nombre.trim(),
          zona: nuevoVend.zona.trim() || null,
          user_id: nuevoVend.user_id.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCreando(false);
      setNuevoVend({ nombre: "", zona: "", user_id: "" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActivo(v: MercVendedor) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mercaderia/vendedores/${v.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activo: !v.activo }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <ul className="space-y-1">
          {vendedores.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setSelected(v.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  selected === v.id ? "bg-[#4FAEB2]/10 text-[#4FAEB2]" : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <div>
                  <div className="font-semibold">{v.nombre}</div>
                  <div className="text-[11px] text-slate-500">{v.zona ?? "—"}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${v.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {v.activo ? "on" : "off"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div id="nuevo" className="mt-3 border-t border-slate-100 pt-3">
          {creando ? (
            <div className="space-y-2 rounded-xl bg-emerald-50/40 p-2">
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="Nombre"
                value={nuevoVend.nombre}
                onChange={(e) => setNuevoVend({ ...nuevoVend, nombre: e.target.value })}
                autoFocus
              />
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="Zona (opcional)"
                value={nuevoVend.zona}
                onChange={(e) => setNuevoVend({ ...nuevoVend, zona: e.target.value })}
              />
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                placeholder="UUID auth (opcional)"
                value={nuevoVend.user_id}
                onChange={(e) => setNuevoVend({ ...nuevoVend, user_id: e.target.value })}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCreando(false)}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={crearVendedor}
                  className="flex-1 rounded bg-[#4FAEB2] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
                >
                  Crear
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreando(true)}
              className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-[#4FAEB2] hover:text-[#4FAEB2]"
            >
              + Agregar vendedor
            </button>
          )}
        </div>
      </aside>

      <div className="space-y-4">
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

        {vendSel ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{vendSel.nombre}</h3>
                  <div className="text-xs text-slate-500">
                    {vendSel.zona ?? "—"} · {vendSel.user_id ? "Con login" : "Sin login"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleActivo(vendSel)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {vendSel.activo ? "Dar de baja" : "Reactivar"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {modo === "retirar" ? "Retirar mercadería" : "Asignar mercadería"}
                </h4>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setModo("asignar")}
                    className={`rounded-full px-3 py-1 text-xs ${modo === "asignar" ? "bg-[#4FAEB2] text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    Asignar
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo("retirar")}
                    className={`rounded-full px-3 py-1 text-xs ${modo === "retirar" ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    Retirar
                  </button>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                      <th className="px-5 py-2 text-left">Producto</th>
                      <th className="px-5 py-2 text-right">Stock actual</th>
                      <th className="px-5 py-2 text-right">
                        Cantidad a {modo === "retirar" ? "retirar" : "asignar"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productos.map((p) => {
                      const s = stockDelVend?.get(p.id) ?? 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-2 text-slate-800">{p.nombre}</td>
                          <td className={`px-5 py-2 text-right tabular-nums ${s > 0 ? "text-slate-900 font-semibold" : "text-slate-400"}`}>
                            {fmtInt(s)}
                          </td>
                          <td className="px-5 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                              value={String(asignaciones[p.id] ?? "")}
                              onChange={(e) =>
                                setAsignaciones({ ...asignaciones, [p.id]: Number(e.target.value) || 0 })
                              }
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Notas (opcional)"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={guardarAsignaciones}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${modo === "retirar" ? "bg-amber-500 hover:bg-amber-600" : "bg-[#4FAEB2] hover:bg-[#3F8E91]"}`}
                >
                  {busy ? "..." : modo === "retirar" ? "Retirar" : "Asignar"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Elegí un vendedor de la lista.
          </div>
        )}
      </div>
    </div>
  );
}
