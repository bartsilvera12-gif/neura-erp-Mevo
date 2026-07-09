import "server-only";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

/**
 * Gestión y visibilidad de revendedores + sus comisiones: **solo administradores**.
 *
 * Regla del negocio: un asesor/vendedor NO debe ver ni gestionar los revendedores del resto
 * (a lo sumo lo suyo); ver el de todos es exclusivo de un administrador. Antes las rutas de
 * revendedores sólo validaban pertenencia a la empresa (`getTenantSupabaseFromAuth`), así que
 * cualquier usuario no-admin listaba/veía stats de TODOS los revendedores — fuga de comisiones
 * ajenas. Este guard cierra list/stats/create/update a no-admins.
 */
export type RevendedoresAdminGuard =
  | { ok: true; empresaId: string }
  | { ok: false; status: number; message: string };

export async function requireRevendedoresAdmin(request: Request): Promise<RevendedoresAdminGuard> {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx?.auth?.empresa_id) {
    return { ok: false, status: 401, message: "No autenticado" };
  }
  if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
    return {
      ok: false,
      status: 403,
      message: "Solo un administrador puede ver y gestionar los revendedores y sus comisiones.",
    };
  }
  return { ok: true, empresaId: ctx.auth.empresa_id };
}
