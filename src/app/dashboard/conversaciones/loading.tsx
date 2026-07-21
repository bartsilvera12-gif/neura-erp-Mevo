/**
 * Esqueleto instantáneo del inbox. Next.js lo muestra apenas se navega a la ruta,
 * mientras el Server Component resuelve el bootstrap (presencia/rol/nombre) contra
 * la base remota. Antes no existía `loading.tsx`, así que la pantalla quedaba en
 * blanco varios segundos hasta que terminaba toda la cadena de consultas.
 *
 * Reproduce la estructura visible (pestañas Inbox/Bot, buscador, filtros, lista)
 * para que el usuario perciba la pantalla al instante en vez de un vacío.
 */
export default function ConversacionesLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Omnicanal
            </p>
          </div>
          <div className="mt-2 h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-6 w-28 animate-pulse rounded-full bg-slate-200 shrink-0" />
      </div>

      {/* Pestañas Inbox / Bot + buscador */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <span className="rounded-md bg-[#4FAEB2] px-4 py-1.5 text-sm font-medium text-white">
            Inbox
          </span>
          <span className="rounded-md px-4 py-1.5 text-sm font-medium text-slate-400">Bot</span>
        </div>
        <div className="h-10 flex-1 min-w-[12rem] animate-pulse rounded-lg bg-slate-100" />
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 shrink-0">
        {["Canal", "Cola", "Asignación"].map((f) => (
          <div key={f}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {f}
            </p>
            <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Lista de chats + panel */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-10 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400 lg:flex">
          Cargando conversaciones…
        </div>
      </div>
    </div>
  );
}
