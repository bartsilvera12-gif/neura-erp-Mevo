"use client";

import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ModuleAccessResponse = {
  /** true si el endpoint respondió (datos autoritativos); false si falló/no autenticado. */
  ok: boolean;
  status: number;
  superAdmin: boolean;
  slugs: string[];
  modulos: { id: string; nombre: string; slug: string }[];
};

let inFlight: Promise<ModuleAccessResponse> | null = null;
let cached: { at: number; data: ModuleAccessResponse } | null = null;

/**
 * Ventana de coalescencia. AuthGuard y Sidebar piden module-access casi a la vez
 * en cada carga; compartir la respuesta durante unos ms evita la doble consulta
 * (cada una hace ~6 queries en el server). Se mantiene corto para que cada refresh
 * o reingreso de pestaña siga trayendo datos frescos.
 */
const COALESCE_MS = 4000;

async function run(): Promise<ModuleAccessResponse> {
  try {
    const res = await fetchWithSupabaseSession("/api/empresas/module-access", {
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, status: res.status, superAdmin: false, slugs: [], modulos: [] };
    }
    const body = (await res.json()) as {
      superAdmin?: boolean;
      slugs?: string[];
      modulos?: { id?: string; nombre?: string; slug?: string }[];
    };
    return {
      ok: true,
      status: res.status,
      superAdmin: !!body.superAdmin,
      slugs: Array.isArray(body.slugs) ? body.slugs : [],
      modulos: Array.isArray(body.modulos)
        ? body.modulos.map((m) => ({ id: m.id ?? "", nombre: m.nombre ?? "", slug: m.slug ?? "" }))
        : [],
    };
  } catch {
    return { ok: false, status: 0, superAdmin: false, slugs: [], modulos: [] };
  }
}

/**
 * GET `/api/empresas/module-access` deduplicado entre los consumidores del arranque
 * (AuthGuard + Sidebar). Con `force` se ignora la ventana de coalescencia y se trae
 * fresco (p. ej. tras un evento real de auth: login/logout/perfil).
 */
export function fetchModuleAccess(force = false): Promise<ModuleAccessResponse> {
  const t = Date.now();
  if (!force && cached && t - cached.at < COALESCE_MS) {
    return Promise.resolve(cached.data);
  }
  if (!force && inFlight) {
    return inFlight;
  }
  const p = run();
  inFlight = p;
  void p
    .then((data) => {
      cached = { at: Date.now(), data };
    })
    .finally(() => {
      if (inFlight === p) inFlight = null;
    });
  return p;
}
