import { NextRequest, NextResponse } from "next/server";
import { createProducto, type ProductoInput } from "@/lib/mercaderia/server-mutations";
import { requireAdmin } from "@/lib/mercaderia/guard-api";

export async function POST(request: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => ({}))) as Partial<ProductoInput>;
  if (!body?.nombre || String(body.nombre).trim().length === 0) {
    return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
  }
  const res = await createProducto(body as ProductoInput);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
