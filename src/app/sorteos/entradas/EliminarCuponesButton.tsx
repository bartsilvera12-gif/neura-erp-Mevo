"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  entradaId: string;
  cantidadActual: number;
  nombreParticipante: string;
};

export default function EliminarCuponesButton({
  entradaId,
  cantidadActual,
  nombreParticipante,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cantidad, setCantidad] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = parseInt(cantidad, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Ingresá un número mayor a 0.");
      return;
    }
    if (n > cantidadActual) {
      setErr(`Máximo ${cantidadActual} (los que tiene esta entrada).`);
      return;
    }
    const confirmMsg =
      n === cantidadActual
        ? `Vas a eliminar TODOS los ${n} cupones de ${nombreParticipante}. ¿Seguro?`
        : `Vas a eliminar ${n} cupones de ${nombreParticipante}. La entrada quedará con ${cantidadActual - n} cupones. ¿Seguro?`;
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/sorteos/entradas/${entradaId}/eliminar-cupones`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cantidad: n }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      setCantidad("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErr(null);
          setCantidad("");
        }}
        className="ml-2 text-[11px] text-red-600 hover:text-red-800 hover:underline"
        title={`Eliminar cupones de esta entrada (máximo ${cantidadActual})`}
      >
        Borrar de {cantidadActual}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5 mx-4">
            <div className="text-sm font-semibold text-slate-800 mb-1">
              Eliminar cupones
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {nombreParticipante} · {cantidadActual} cupones actuales
            </div>
            <label className="block text-xs text-slate-600 mb-1">
              ¿Cuántos cupones eliminar?
            </label>
            <input
              type="number"
              min={1}
              max={cantidadActual}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              autoFocus
              disabled={busy}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2] focus:border-transparent"
              placeholder={`1 – ${cantidadActual}`}
            />
            {err ? (
              <div className="mt-2 text-xs text-red-600">{err}</div>
            ) : null}
            <div className="text-[11px] text-slate-400 mt-2 leading-snug">
              Se eliminan los cupones más recientes primero. La entrada baja su
              cantidad. Reversible solo re-generando cupones manualmente.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !cantidad.trim()}
                onClick={submit}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
