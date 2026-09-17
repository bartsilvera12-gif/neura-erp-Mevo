"use server";

import { redirect } from "next/navigation";
import { getMercRole } from "./roles";

/**
 * Server helper: usar al principio de una page.tsx admin. Redirige a la
 * home del vendedor si el usuario es rol vendedor, o al login si no hay sesión.
 */
export async function requireAdminOrRedirect(): Promise<void> {
  const role = await getMercRole();
  if (role.mode === "vendedor") redirect("/mercaderia/mi-stock");
  if (role.mode === "none") redirect("/");
}
