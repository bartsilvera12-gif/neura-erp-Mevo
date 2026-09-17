"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MercProducto } from "@/lib/mercaderia/types";

function fmtInt(n: number) {
  return (Number(n) || 0).toLocaleString("es-PY");
}

type EditState = Partial<Omit<MercProducto, "id" | "orden">>;

export default function ProductosClient({ inicial }: { inicial: MercProducto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<EditState>({
    nombre: "",
    costo_unitario: 0,
    precio_unitario: 0,
    comision_unitaria: 0,
    precio_mayorista_6: 0,
    comision_mayorista_6: 0,
    precio_mayorista_12: 0,
    comision_mayorista_12: 0,
    tiene_mayorista: true,
    activo: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [showInactivos, setShowInactivos] = useState(false);

  const filtrados = useMemo(
    () => (showInactivos ? inicial : inicial.filter((p) => p.activo)),
    [inicial, showInactivos]
  );

  function beginEdit(p: MercProducto) {
    setEditing((prev) => ({
      ...prev,
      [p.id]: {
        nombre: p.nombre,
        costo_unitario: p.costo_unitario,
        precio_unitario: p.precio_unitario,
        comision_unitaria: p.comision_unitaria,
        precio_mayorista_6: p.precio_mayorista_6,
        comision_mayorista_6: p.comision_mayorista_6,
        precio_mayorista_12: p.precio_mayorista_12,
        comision_mayorista_12: p.comision_mayorista_12,
        tiene_mayorista: p.tiene_mayorista,
        activo: p.activo,
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setField(id: string, field: keyof EditState, value: string | number | boolean) {
    setEditing((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  }

  async function guardarEdit(id: string) {
    const patch = editing[id];
    if (!patch) return;
    setError(null);
    setBusy(id);
    try {
      const res = await fetch(`/api/mercaderia/productos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      cancelEdit(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(null);
    }
  }

  async function crearProducto() {
    if (!nuevo.nombre?.trim()) {
      setError("Poné un nombre.");
      return;
    }
    setError(null);
    setBusy("__nuevo");
    try {
      const res = await fetch(`/api/mercaderia/productos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCreando(false);
      setNuevo({
        nombre: "",
        costo_unitario: 0,
        precio_unitario: 0,
        comision_unitaria: 0,
        precio_mayorista_6: 0,
        comision_mayorista_6: 0,
        precio_mayorista_12: 0,
        comision_mayorista_12: 0,
        tiene_mayorista: true,
        activo: true,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActivo(p: MercProducto) {
    setBusy(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/mercaderia/productos/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activo: !p.activo }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={(e) => setShowInactivos(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#4FAEB2]"
          />
          Mostrar inactivos
        </label>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
        >
          + Nuevo producto
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-right">P. Unit.</th>
                <th className="px-3 py-2 text-right">Com. Unit.</th>
                <th className="px-3 py-2 text-right">P. Mayor. 6+</th>
                <th className="px-3 py-2 text-right">Com. 6+</th>
                <th className="px-3 py-2 text-right">P. Mayor. 12+</th>
                <th className="px-3 py-2 text-right">Com. 12+</th>
                <th className="px-3 py-2 text-center">Mayor.</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {creando ? (
                <tr className="bg-emerald-50/40">
                  <td className="px-3 py-2">
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      value={String(nuevo.nombre ?? "")}
                      onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                      placeholder="Nombre"
                      autoFocus
                    />
                  </td>
                  {(
                    [
                      "costo_unitario",
                      "precio_unitario",
                      "comision_unitaria",
                      "precio_mayorista_6",
                      "comision_mayorista_6",
                      "precio_mayorista_12",
                      "comision_mayorista_12",
                    ] as const
                  ).map((k) => (
                    <td key={k} className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                        value={String(nuevo[k] ?? 0)}
                        onChange={(e) => setNuevo({ ...nuevo, [k]: Number(e.target.value) || 0 })}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!nuevo.tiene_mayorista}
                      onChange={(e) => setNuevo({ ...nuevo, tiene_mayorista: e.target.checked })}
                      className="h-4 w-4 accent-[#4FAEB2]"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      nuevo
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setCreando(false)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busy === "__nuevo"}
                        onClick={crearProducto}
                        className="rounded bg-[#4FAEB2] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
                      >
                        {busy === "__nuevo" ? "..." : "Crear"}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}

              {filtrados.map((p) => {
                const ed = editing[p.id];
                const editando = !!ed;
                return (
                  <tr key={p.id} className={editando ? "bg-amber-50/50" : "hover:bg-slate-50/60"}>
                    <td className="px-3 py-2">
                      {editando ? (
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          value={String(ed.nombre ?? "")}
                          onChange={(e) => setField(p.id, "nombre", e.target.value)}
                        />
                      ) : (
                        <span className="font-medium text-slate-800">{p.nombre}</span>
                      )}
                    </td>
                    {(
                      [
                        "costo_unitario",
                        "precio_unitario",
                        "comision_unitaria",
                        "precio_mayorista_6",
                        "comision_mayorista_6",
                        "precio_mayorista_12",
                        "comision_mayorista_12",
                      ] as const
                    ).map((k) => (
                      <td key={k} className="px-3 py-2 text-right tabular-nums">
                        {editando ? (
                          <input
                            type="number"
                            min={0}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                            value={String(ed[k] ?? 0)}
                            onChange={(e) => setField(p.id, k, Number(e.target.value) || 0)}
                          />
                        ) : (
                          fmtInt(p[k])
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {editando ? (
                        <input
                          type="checkbox"
                          checked={!!ed.tiene_mayorista}
                          onChange={(e) => setField(p.id, "tiene_mayorista", e.target.checked)}
                          className="h-4 w-4 accent-[#4FAEB2]"
                        />
                      ) : p.tiene_mayorista ? (
                        <span className="text-[#4FAEB2]">✓</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${p.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {p.activo ? "activo" : "inactivo"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editando ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => cancelEdit(p.id)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={busy === p.id}
                            onClick={() => guardarEdit(p.id)}
                            className="rounded bg-[#4FAEB2] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
                          >
                            {busy === p.id ? "..." : "Guardar"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => beginEdit(p)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={busy === p.id}
                            onClick={() => toggleActivo(p)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {p.activo ? "Desactivar" : "Reactivar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
