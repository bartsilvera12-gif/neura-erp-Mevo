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
 * La columna "Cliente" prioriza el nombre + apellido que la persona cargó
 * en el bot al comprar su boleta (chat_flow_data). Muchos usuarios tienen
 * emojis o alias en la agenda de WhatsApp, así que el nombre del flow es
 * lo que sirve para identificarlos. Se usa el nombre de agenda como
 * fallback si el flow todavía no tiene el dato cargado.
 */
function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Paraguay pasó a UTC-3 permanente en 2024. No dependemos del tzdata del
 * runtime (Coolify puede tener una versión desactualizada que devuelve -4).
 */
const PY_OFFSET_HOURS = -3;
const PY_OFFSET_MS = PY_OFFSET_HOURS * 60 * 60 * 1000;

function ymdAsuncionToUtcBounds(ymd: string): { desde: string; hasta: string } {
  const desde = new Date(`${ymd}T00:00:00-03:00`).toISOString();
  const hasta = new Date(`${ymd}T23:59:59.999-03:00`).toISOString();
  return { desde, hasta };
}

function formatHoraPy(isoUtc: string): string {
  const utc = new Date(isoUtc);
  const local = new Date(utc.getTime() + PY_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
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
    : new Date(Date.now() + PY_OFFSET_MS).toISOString().slice(0, 10);

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
    const tFd = quoteSchemaTable(schema, "chat_flow_data");
    const { desde, hasta } = ymdAsuncionToUtcBounds(fecha);
    // Subqueries laterales para tomar el ultimo valor no vacio de cada campo
    // relevante del flow para esa conversacion (nombre, apellido, cedula, ciudad).
    // Cubrimos las variantes usadas por distintos flujos ("nombre" | "primer_nombre",
    // etc). Ordenamos por created_at desc para tomar el dato mas reciente.
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
              cc.phone_number,
              (select fd.field_value from ${tFd} fd
                where fd.conversation_id = cv.conversation_id
                  and lower(fd.field_name) in ('nombre','primer_nombre','nombre_completo','nombre_y_apellido')
                  and coalesce(nullif(btrim(fd.field_value), ''), null) is not null
                order by fd.created_at desc
                limit 1) as flow_nombre,
              (select fd.field_value from ${tFd} fd
                where fd.conversation_id = cv.conversation_id
                  and lower(fd.field_name) in ('apellido','primer_apellido')
                  and coalesce(nullif(btrim(fd.field_value), ''), null) is not null
                order by fd.created_at desc
                limit 1) as flow_apellido,
              (select fd.field_value from ${tFd} fd
                where fd.conversation_id = cv.conversation_id
                  and lower(fd.field_name) in ('cedula','documento','nro_documento','numero_documento','ci')
                  and coalesce(nullif(btrim(fd.field_value), ''), null) is not null
                order by fd.created_at desc
                limit 1) as flow_cedula,
              (select fd.field_value from ${tFd} fd
                where fd.conversation_id = cv.conversation_id
                  and lower(fd.field_name) = 'ciudad'
                  and coalesce(nullif(btrim(fd.field_value), ''), null) is not null
                order by fd.created_at desc
                limit 1) as flow_ciudad
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
      const hora = formatHoraPy(String(row.created_at));
      const flowNombre = String((row.flow_nombre as string | null) ?? "").trim();
      const flowApellido = String((row.flow_apellido as string | null) ?? "").trim();
      const nombreFlow = [flowNombre, flowApellido].filter(Boolean).join(" ").trim();
      const nombreAgenda = String((row.contacto_nombre as string | null) ?? "").trim();
      const cliente = nombreFlow || nombreAgenda;
      return {
        hora,
        monto: Number(row.monto_validacion_ocr_gs) || 0,
        cliente,
        nombre_agenda: nombreAgenda,
        cedula: String((row.flow_cedula as string | null) ?? "").trim(),
        ciudad: String((row.flow_ciudad as string | null) ?? "").trim(),
        titular_ocr: String((row.bank_val_titular_ocr as string | null) ?? "").trim(),
        telefono: (row.phone_number as string | null) ?? "",
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
        { header: "Cliente", value: (r) => r.cliente, width: 28 },
        { header: "Cédula", value: (r) => r.cedula, width: 12 },
        { header: "Ciudad", value: (r) => r.ciudad, width: 18 },
        { header: "Teléfono", value: (r) => r.telefono, width: 15 },
        { header: "Nombre en agenda WhatsApp", value: (r) => r.nombre_agenda, width: 24 },
        { header: "Titular (según OCR)", value: (r) => r.titular_ocr, width: 28 },
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
