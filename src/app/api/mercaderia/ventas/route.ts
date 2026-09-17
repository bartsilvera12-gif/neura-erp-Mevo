import { NextRequest, NextResponse } from "next/server";
import { registrarVenta, type VentaInput } from "@/lib/mercaderia/server-mutations";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<VentaInput>;
  if (!body?.vendedor_id) {
    return NextResponse.json({ ok: false, error: "vendedor_id requerido" }, { status: 400 });
  }
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) {
    return NextResponse.json({ ok: false, error: "sin líneas" }, { status: 400 });
  }
  if (typeof body.monto_total_real !== "number" || body.monto_total_real < 0) {
    return NextResponse.json({ ok: false, error: "monto inválido" }, { status: 400 });
  }
  const tipo = body.tipo === "combo" ? "combo" : "simple";
  const res = await registrarVenta({
    vendedor_id: body.vendedor_id,
    tipo,
    fecha: body.fecha ?? null,
    monto_total_real: body.monto_total_real,
    lineas: body.lineas,
    notas: body.notas ?? null,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
