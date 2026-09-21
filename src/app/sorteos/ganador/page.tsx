import Link from "next/link";
import {
  fetchGanadorPorCuponServer,
  fetchSorteosListServer,
  pickDefaultSorteoId,
} from "@/lib/sorteos/server-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

function pickStr(sp: Sp, key: string): string | undefined {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return undefined;
}

function estadoPagoLabel(e: string) {
  if (e === "pendiente_revision") return "Pendiente revisión";
  if (e === "pendiente") return "Pendiente";
  if (e === "confirmado") return "Confirmado";
  if (e === "rechazado") return "Rechazado";
  return e;
}

const tabClass =
  "rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700";

export default async function SorteoGanadorPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const numero = pickStr(sp, "numero")?.trim() || undefined;
  const sorteoId = pickStr(sp, "sorteo_id")?.trim() || undefined;

  const { sorteos } = await fetchSorteosListServer();
  const defaultSorteoId = pickDefaultSorteoId(sorteos);
  const selectedSorteoId =
    sorteoId === "all" ? null : sorteoId ?? defaultSorteoId ?? null;
  const selectValue = sorteoId === "all" ? "all" : sorteoId ?? defaultSorteoId ?? "all";

  const result = numero
    ? await fetchGanadorPorCuponServer(numero, selectedSorteoId)
    : null;
  const ganador = result?.ganador ?? null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/sorteos" className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]">
          Sorteos
        </Link>
        <span aria-hidden className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Ganador</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Sorteos · Ganador
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Buscar ganador por número de boleta</h1>
        <p className="mt-1 text-sm text-slate-500">Ingresá el número de boleta ganadora y el sistema muestra al comprador</p>
      </div>

      {/* Tabs */}
      <div className="flex w-full flex-wrap gap-1 rounded-2xl border border-[#4FAEB2]/45 bg-white p-1.5 shadow-sm sm:w-fit">
        <Link href="/sorteos" className={tabClass}>Sorteos</Link>
        <Link href="/sorteos/entradas" className={tabClass}>Entradas</Link>
        <Link href="/sorteos/cupones" className={tabClass}>Cupones</Link>
        <Link href="/sorteos/tickets" className={tabClass}>Tickets</Link>
        <span className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#4FAEB2]/30">
          Ganador
        </span>
      </div>

      {/* Buscador */}
      <form method="get" className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Número ganador
          </h3>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">N.º de boleta</span>
            <input
              name="numero"
              defaultValue={numero ?? ""}
              inputMode="numeric"
              placeholder="Ej. 0123"
              autoFocus
              className="w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sorteo</span>
            <select
              name="sorteo_id"
              defaultValue={selectValue}
              className="w-[260px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              {sorteos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.estado === "activo" ? " (activo)" : ""}
                </option>
              ))}
              <option value="all">Todos los sorteos</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Buscar ganador
          </button>
          <Link
            href="/sorteos/ganador"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {result?.transient_error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La base de datos está saturada momentáneamente. Reintentá en unos segundos.
        </div>
      ) : null}

      {result?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error al buscar:</strong> {result.error}
        </div>
      ) : null}

      {/* Resultado */}
      {numero && !result?.error && !ganador ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-4xl">🔍</p>
          <p className="mt-3 text-base font-semibold text-slate-800">
            No se encontró ninguna boleta con el número «{numero}»
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Revisá el número o probá seleccionando «Todos los sorteos».
          </p>
        </div>
      ) : null}

      {ganador ? (
        <div className="overflow-hidden rounded-3xl border-2 border-[#4FAEB2] bg-gradient-to-b from-[#4FAEB2]/10 to-white shadow-lg">
          <div className="bg-[#4FAEB2] px-6 py-5 text-center text-white">
            <p className="text-3xl font-bold tracking-tight">¡Felicidades al ganador! 🎉</p>
            <p className="mt-1 text-sm font-medium text-white/90">
              Boleta N.º {ganador.numero_cupon} · {ganador.sorteo_nombre}
            </p>
          </div>
          <div className="p-6">
            <p className="text-center text-2xl font-semibold text-slate-900">
              {ganador.nombre_participante || "—"}
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#4FAEB2]/40 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Ciudad</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{ganador.ciudad ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-[#4FAEB2]/40 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Cédula</p>
                <p className="mt-1 text-sm font-mono font-medium text-slate-800">{ganador.documento ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-[#4FAEB2]/40 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Celular</p>
                <p className="mt-1 text-sm font-mono font-medium text-slate-800">{ganador.whatsapp_numero || "—"}</p>
              </div>
              <div className="rounded-2xl border border-[#4FAEB2]/40 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Estado de pago</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{estadoPagoLabel(ganador.estado_pago)}</p>
              </div>
            </div>
            {ganador.estado_pago === "rechazado" ? (
              <p className="mx-auto mt-4 max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900">
                ⚠️ Esta boleta pertenece a una orden <strong>rechazada / anulada</strong>. Verificá antes de anunciar.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
