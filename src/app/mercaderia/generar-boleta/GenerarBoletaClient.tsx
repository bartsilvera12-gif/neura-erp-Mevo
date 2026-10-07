"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type SorteoListItem = { id: string; nombre: string; estado?: string };
type VendedorItem = { id: string; nombre: string };

const COMISION_PCT = 0.2;

function fmtGs(n: number) {
  return `${(Number(n) || 0).toLocaleString("es-PY")} ₲`;
}

export default function GenerarBoletaClient({
  esAdmin,
  vendedores,
}: {
  esAdmin: boolean;
  vendedores: VendedorItem[];
}) {
  const [loading, setLoading] = useState(false);
  const [sorteos, setSorteos] = useState<SorteoListItem[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [form, setForm] = useState({
    sorteo_id: "",
    merc_vendedor_id: "",
    nombre: "",
    apellido: "",
    cedula: "",
    telefono: "",
    cantidad_boletos: "1",
    monto_total: "",
  });
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [result, setResult] = useState<
    | { numero_orden: number | string; cupones: string[]; monto: number; comision: number }
    | null
  >(null);

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      try {
        const res = await fetchWithSupabaseSession("/api/sorteos", { cache: "no-store" });
        const json = (await res.json()) as { success?: boolean; data?: SorteoListItem[] };
        if (!res.ok || !json.success || !Array.isArray(json.data)) {
          setLoadErr("No se pudieron cargar los sorteos.");
          return;
        }
        if (cancelled) return;
        const activos = json.data.filter((s) => (s.estado ?? "activo") === "activo");
        const list = activos.length > 0 ? activos : json.data;
        setSorteos(list);
        setForm((f) => (f.sorteo_id ? f : { ...f, sorteo_id: list[0]?.id ?? "" }));
      } catch {
        if (!cancelled) setLoadErr("Error de red al cargar sorteos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onField = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setForm((p) => ({ ...p, [name]: value }));
    },
    []
  );

  const montoNum = Number(form.monto_total) || 0;
  const comisionPreview = Math.round(montoNum * COMISION_PCT);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    setResult(null);

    const cantidad = Math.floor(Number(form.cantidad_boletos));
    const monto = Number(form.monto_total);
    if (!form.sorteo_id) return setSubmitErr("Elegí un sorteo.");
    if (!form.nombre.trim() || !form.apellido.trim()) return setSubmitErr("Nombre y apellido son obligatorios.");
    if (!form.telefono.trim()) return setSubmitErr("El teléfono es obligatorio.");
    if (!Number.isFinite(cantidad) || cantidad < 1) return setSubmitErr("La cantidad de boletas debe ser mayor a 0.");
    if (!Number.isFinite(monto) || monto <= 0) return setSubmitErr("Ingresá el monto cobrado.");
    if (esAdmin && !form.merc_vendedor_id) return setSubmitErr("Elegí el vendedor al que se atribuye.");
    if (!idempotencyKey) return setSubmitErr("Recargá la página e intentá de nuevo.");

    setLoading(true);
    try {
      const res = await fetchWithSupabaseSession("/api/sorteos/manual-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sorteo_id: form.sorteo_id,
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          cedula: form.cedula.trim(),
          telefono: form.telefono.trim(),
          cantidad_boletos: cantidad,
          monto_total: monto,
          generar_ticket_png: true,
          idempotency_key: idempotencyKey,
          merc_vendedor_id: esAdmin ? form.merc_vendedor_id : undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { numero_orden?: number; cupones?: { numero_cupon: string }[]; monto_total?: number };
        error?: string;
      };
      if (!res.ok || !json.success) {
        setSubmitErr(json.error ?? "No se pudo generar la boleta.");
        return;
      }
      const cupones = (json.data?.cupones ?? []).map((c) => c.numero_cupon).sort();
      const montoReal = Number(json.data?.monto_total ?? monto) || monto;
      setResult({
        numero_orden: json.data?.numero_orden ?? "—",
        cupones,
        monto: montoReal,
        comision: Math.round(montoReal * COMISION_PCT),
      });
      // Nueva clave para la próxima boleta.
      setIdempotencyKey(crypto.randomUUID());
      setForm((p) => ({
        ...p,
        nombre: "",
        apellido: "",
        cedula: "",
        telefono: "",
        cantidad_boletos: "1",
        monto_total: "",
      }));
    } catch {
      setSubmitErr("Error de red al generar la boleta.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        {loadErr ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{loadErr}</div>
        ) : null}
        {submitErr ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitErr}</div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Sorteo
          <select name="sorteo_id" value={form.sorteo_id} onChange={onField} required className={inputCls}>
            <option value="">— Elegir —</option>
            {sorteos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {(s.estado ?? "") !== "activo" ? ` (${s.estado})` : ""}
              </option>
            ))}
          </select>
        </label>

        {esAdmin ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Vendedor (a quién se atribuye)
            <select name="merc_vendedor_id" value={form.merc_vendedor_id} onChange={onField} className={inputCls}>
              <option value="">— Elegir vendedor —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Nombre
            <input name="nombre" value={form.nombre} onChange={onField} required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Apellido
            <input name="apellido" value={form.apellido} onChange={onField} required className={inputCls} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Cédula
            <input name="cedula" value={form.cedula} onChange={onField} className={`${inputCls} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Teléfono
            <input name="telefono" value={form.telefono} onChange={onField} required placeholder="0981123456" className={`${inputCls} font-mono`} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Cantidad de boletas
            <input name="cantidad_boletos" type="number" min={1} step={1} value={form.cantidad_boletos} onChange={onField} required className={`${inputCls} tabular-nums`} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Monto cobrado (₲)
            <input name="monto_total" type="number" min={0} step={1} value={form.monto_total} onChange={onField} required placeholder="Ej. 20000" className={`${inputCls} tabular-nums`} />
          </label>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[#4FAEB2]/10 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Tu comisión (20%)</span>
          <span className="text-lg font-bold tabular-nums text-[#3F8E91]">{fmtGs(comisionPreview)}</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#4FAEB2] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-60"
        >
          {loading ? "Generando…" : "Generar boleta"}
        </button>
      </form>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:self-start">
        {result ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center">
              <p className="text-2xl">✅</p>
              <p className="mt-1 text-sm font-semibold text-emerald-800">¡Boleta generada!</p>
              <p className="text-xs text-emerald-700">Orden Nº {result.numero_orden}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Números de boleta</p>
              <p className="mt-1 break-words font-mono text-sm font-semibold text-slate-800">
                {result.cupones.length ? result.cupones.join(", ") : "—"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Monto</p>
                <p className="text-sm font-semibold tabular-nums text-slate-800">{fmtGs(result.monto)}</p>
              </div>
              <div className="rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Comisión</p>
                <p className="text-sm font-semibold tabular-nums text-[#3F8E91]">{fmtGs(result.comision)}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Dictá o mostrale los números al cliente. La boleta quedó registrada a tu nombre.</p>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-slate-400">
            Completá los datos y tocá <span className="font-semibold text-slate-500">Generar boleta</span>. Acá van a
            aparecer los números y tu comisión.
          </div>
        )}
      </aside>
    </div>
  );
}
