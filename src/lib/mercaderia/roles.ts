"use server";

import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { isErpRolVendedor } from "@/lib/usuarios/erp-rol-normalize";
import { getMercVendedorForCurrentUser } from "./server-queries";
import type { MercVendedor } from "./types";

export type MercRole =
  | { mode: "admin"; vendedor: null }
  | { mode: "vendedor"; vendedor: MercVendedor }
  | { mode: "none"; vendedor: null };

/**
 * Devuelve el rol del usuario actual para el módulo de mercadería.
 * - admin: si es administrador del ERP; ve todo aunque tenga fila en merc_vendedores
 * - vendedor: si tiene fila en merc_vendedores y NO es admin
 * - none: sin sesión o sin acceso
 *
 * Prioridad admin > vendedor así el dueño puede ser tanto admin como vender.
 */
export async function getMercRole(): Promise<MercRole> {
  const auth = await getAuthWithRol(null);
  if (!auth) return { mode: "none", vendedor: null };
  if (isAdmin(auth)) return { mode: "admin", vendedor: null };
  const vendedor = await getMercVendedorForCurrentUser();
  if (vendedor && vendedor.activo) return { mode: "vendedor", vendedor };
  // Fallback por rol nominal del ERP (no matcheó fila de vendedor pero rol dice vendedor).
  if (isErpRolVendedor(auth.rol)) return { mode: "vendedor", vendedor: vendedor as MercVendedor };
  return { mode: "none", vendedor: null };
}
