import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

/**
 * Obtiene empresa_id del usuario actual.
 * @throws Error si el usuario no está autenticado o no tiene empresa asignada
 */
export async function getEmpresaId(): Promise<string> {
  const usuario = await getCurrentUser();
  if (!usuario?.empresa_id) {
    throw new Error("Usuario no autenticado o sin empresa");
  }
  return usuario.empresa_id;
}

/**
 * Devuelve un query builder de Supabase filtrado por empresa_id del usuario actual.
 * Útil para estandarizar consultas multiempresa en el ERP.
 *
 * @example
 * const { data } = await (await queryEmpresa("productos")).select("*");
 * const { data } = await (await queryEmpresa("clientes")).select("*").order("nombre");
 */
export async function queryEmpresa(tabla: string) {
  const empresaId = await getEmpresaId();
  // Tabla dinámica: Supabase tipa por nombre literal; con string el builder no expone .eq() en tipos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.from(tabla as any) as any).eq("empresa_id", empresaId);
}
