import { NextRequest, NextResponse } from "next/server";
import { registrarRendicion, type RendicionInput } from "@/lib/mercaderia/server-mutations";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<RendicionInput>;
  if (!body?.vendedor_id) {
    return NextResponse.json({ ok: false, error: "vendedor_id requerido" }, { status: 400 });
  }
  const res = await registrarRendicion({
    vendedor_id: body.vendedor_id,
    fecha: body.fecha ?? null,
    monto_rendido: Number(body.monto_rendido) || 0,
    comision_pagada: Number(body.comision_pagada) || 0,
    notas: body.notas ?? null,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
