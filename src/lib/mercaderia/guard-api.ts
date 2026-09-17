"use server";

import { NextResponse } from "next/server";
import { getMercRole, type MercRole } from "./roles";

/**
 * Devuelve el rol si es admin. Sino, retorna una NextResponse 401/403 para
 * cortar el handler. Usar dentro de rutas API que son solo para admin.
 */
export async function requireAdmin(): Promise<
  { ok: true; role: Extract<MercRole, { mode: "admin" }> } | { ok: false; res: NextResponse }
> {
  const role = await getMercRole();
  if (role.mode === "none") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "no_session" }, { status: 401 }) };
  }
  if (role.mode !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "solo_admin" }, { status: 403 }),
    };
  }
  return { ok: true, role };
}

/**
 * Rol vendedor o admin (para endpoints donde un vendedor puede actuar sobre
 * sus propios datos). Devuelve el rol completo.
 */
export async function requireAdminOrVendedor(): Promise<
  { ok: true; role: MercRole } | { ok: false; res: NextResponse }
> {
  const role = await getMercRole();
  if (role.mode === "none") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "no_session" }, { status: 401 }) };
  }
  return { ok: true, role };
}
