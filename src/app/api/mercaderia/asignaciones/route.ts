import { NextRequest, NextResponse } from "next/server";
import { asignarMercaderia, type AsignacionLinea } from "@/lib/mercaderia/server-mutations";
import { requireAdmin } from "@/lib/mercaderia/guard-api";

type Body = {
  vendedor_id?: string;
  lineas?: AsignacionLinea[];
  retirar?: boolean;
  notas?: string | null;
};

export async function POST(request: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => ({}))) as Body;
  const vendedor = String(body.vendedor_id ?? "").trim();
  if (!vendedor) {
    return NextResponse.json({ ok: false, error: "vendedor_id requerido" }, { status: 400 });
  }
  const lineas = Array.isArray(body.lineas) ? body.lineas : [];
  const res = await asignarMercaderia(vendedor, lineas, { retirar: !!body.retirar, notas: body.notas ?? null });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
