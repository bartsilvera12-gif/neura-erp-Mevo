import { NextRequest, NextResponse } from "next/server";
import { createVendedor, type VendedorInput } from "@/lib/mercaderia/server-mutations";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<VendedorInput>;
  if (!body?.nombre || String(body.nombre).trim().length === 0) {
    return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
  }
  const res = await createVendedor(body as VendedorInput);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
