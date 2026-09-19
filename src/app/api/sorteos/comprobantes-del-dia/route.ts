import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";

/**
 * GET /api/sorteos/comprobantes-del-dia?fecha=YYYY-MM-DD
 * Devuelve un .xlsx con las validaciones de comprobantes de ese día
 * (calendario America/Asuncion), pensado para conciliar contra el banco.
 *
 * Columnas: hora, monto detectado por OCR, nombre en el comprobante,
 * teléfono del cliente, nombre en agenda, estado, banco, referencia,
 * URL del comprobante.
 */
function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdAsuncionToUtcBounds(ymd: string): { desde: string; hasta: string } {
  const desde = new Date(`${ymd}T00:00:00-04:00`).toISOString();
  const hasta = new Date(`${ymd}T23:59:59.999-04:00`).toISOString();
  return { desde, hasta };
}

export async function GET(request: NextRequest) {
  const auth = await getUserAndEmpresa(request);
  if (!auth?.empresa_id) {
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  }
  const url = new URL(request.url);
  const fechaRaw = (url.searchParams.get("fecha") ?? "").trim();
  const fecha = fechaRaw && isYmd(fechaRaw)
    ? fechaRaw
    : new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });

  try {
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(
        { ok: false, error: "Sin conexión directa a Postgres" },
        { status: 503 }
      );
    }
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));
    const tCv = quoteSchemaTable(schema, "chat_comprobante_validaciones");
    const tConv = quoteSchemaTable(schema, "chat_conversations");
    const tCt = quoteSchemaTable(schema, "chat_contacts");
    const { desde, hasta } = ymdAsuncionToUtcBounds(fecha);
    const r = await pool.query(
      `select cv.created_at,
              cv.monto_validacion_ocr_gs,
              cv.estado_validacion,
              cv.motivo_validacion,
              cv.ocr_banco,
              cv.ocr_referencia,
              cv.ocr_fecha,
              cv.ocr_hora,
              cv.bank_val_titular_ocr,
              cv.comprobante_url,
              cc.name as contacto_nombre,
              cc.phone_number
         from ${tCv} cv
         left join ${tConv} conv on conv.id = cv.conversation_id
         left join ${tCt} cc on cc.id = conv.contact_id
        where cv.empresa_id = $1::uuid
          and cv.created_at >= $2::timestamptz
          and cv.created_at <= $3::timestamptz
        order by cv.created_at asc`,
      [auth.empresa_id, desde, hasta]
    );

    const rows = r.rows.map((row) => {
      const dt = new Date(row.created_at as string);
      const hora = dt.toLocaleTimeString("es-PY", {
        timeZone: "America/Asuncion",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      return {
        hora,
        monto: Number(row.monto_validacion_ocr_gs) || 0,
        titular_ocr: (row.bank_val_titular_ocr as string | null) ?? "",
        telefono: (row.phone_number as string | null) ?? "",
        contacto_nombre: (row.contacto_nombre as string | null) ?? "",
        estado: (row.estado_validacion as string | null) ?? "",
        motivo: (row.motivo_validacion as string | null) ?? "",
        banco: (row.ocr_banco as string | null) ?? "",
        referencia: (row.ocr_referencia as string | null) ?? "",
        ocr_fecha: (row.ocr_fecha as string | null) ?? "",
        ocr_hora: (row.ocr_hora as string | null) ?? "",
        url: (row.comprobante_url as string | null) ?? "",
      };
    });

    const buf = buildXlsxBuffer(
      rows,
      [
        { header: "Hora", value: (r) => r.hora, width: 10 },
        { header: "Monto (Gs.)", value: (r) => r.monto, width: 14 },
        { header: "Titular (según OCR)", value: (r) => r.titular_ocr, width: 32 },
        { header: "Teléfono", value: (r) => r.telefono, width: 15 },
        { header: "Nombre en agenda", value: (r) => r.contacto_nombre, width: 24 },
        { header: "Estado", value: (r) => r.estado, width: 14 },
        { header: "Motivo", value: (r) => r.motivo, width: 24 },
        { header: "Banco (OCR)", value: (r) => r.banco, width: 16 },
        { header: "Nº comprobante / referencia", value: (r) => r.referencia, width: 24 },
        { header: "Fecha en comprobante", value: (r) => r.ocr_fecha, width: 12 },
        { header: "Hora en comprobante", value: (r) => r.ocr_hora, width: 10 },
        { header: "URL del comprobante", value: (r) => r.url, width: 40 },
      ],
      { sheetName: `Comprobantes ${fecha}`, filename: `comprobantes-${fecha}` }
    );

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`comprobantes-${fecha}`),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240);
    console.error("[comprobantes-del-dia]", { msg, empresa_id: auth.empresa_id, fecha });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
