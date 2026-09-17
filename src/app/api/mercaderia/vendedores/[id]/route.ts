import { NextRequest, NextResponse } from "next/server";
import { updateVendedor, type VendedorInput } from "@/lib/mercaderia/server-mutations";
import { requireAdmin } from "@/lib/mercaderia/guard-api";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const { id } = await params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Partial<VendedorInput>;
  const res = await updateVendedor(id, body);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
