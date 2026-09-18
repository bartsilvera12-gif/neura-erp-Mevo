import { NextRequest, NextResponse } from "next/server";
import { anularVenta } from "@/lib/mercaderia/server-mutations";
import { requireAdminOrVendedor } from "@/lib/mercaderia/guard-api";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminOrVendedor();
  if (!g.ok) return g.res;
  const { id } = await params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { motivo?: string };
  const scope: "admin" | "vendedor" = g.role.mode === "vendedor" ? "vendedor" : "admin";
  const vendedorIdActor = g.role.mode === "vendedor" ? g.role.vendedor.id : undefined;
  const res = await anularVenta(id, { motivo: body?.motivo ?? null, scope, vendedorIdActor });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
