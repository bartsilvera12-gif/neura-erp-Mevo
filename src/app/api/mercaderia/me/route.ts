import { NextResponse } from "next/server";
import { getMercRole } from "@/lib/mercaderia/roles";

export async function GET() {
  const role = await getMercRole();
  return NextResponse.json({
    ok: true,
    data: {
      mode: role.mode,
      vendedor:
        role.mode === "vendedor"
          ? {
              id: role.vendedor.id,
              nombre: role.vendedor.nombre,
              zona: role.vendedor.zona,
            }
          : null,
    },
  });
}
