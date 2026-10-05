import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchStockInversionReport } from "@/lib/mercaderia/stock-inversion";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

export const runtime = "nodejs";

function gs(n: number) {
  return `${(Number(n) || 0).toLocaleString("es-PY")} Gs`;
}

/**
 * GET /api/mercaderia/stock-inversion/export?formato=excel|pdf&vendedor_id=&producto_id=
 * Solo administradores (el reporte muestra costo e inversión).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return new Response("Unauthorized", { status: 401 });
  if (!isAdmin(auth)) return new Response("Solo administradores", { status: 403 });

  const url = new URL(request.url);
  const formato = (url.searchParams.get("formato") ?? "excel").toLowerCase();
  const vendedorId = url.searchParams.get("vendedor_id");
  const productoId = url.searchParams.get("producto_id");

  const rep = await fetchStockInversionReport({ vendedorId, productoId });
  const scope = rep.vendedorNombre ? `Vendedor: ${rep.vendedorNombre}` : "Stock general (todos los vendedores)";
  const fileBase = `stock-inversion-${rep.vendedorNombre ? rep.vendedorNombre.replace(/\s+/g, "_") : "general"}-${nowStamp()}`;

  if (formato === "pdf") {
    const pdf = await buildPdf(rep.rows, rep.totalUnidades, rep.totalInversion, scope);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Excel (default)
  const buf = buildXlsxBuffer(
    rep.rows,
    [
      { header: "PRODUCTO", value: (r) => r.producto_nombre, width: 34 },
      { header: "STOCK", value: (r) => r.stock, width: 12 },
      { header: "COSTO_UNITARIO", value: (r) => r.costo_unitario, width: 16 },
      { header: "INVERSION", value: (r) => r.inversion, width: 18 },
    ],
    { sheetName: "Stock e inversión" }
  );
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: xlsxResponseHeaders(fileBase),
  });
}

async function buildPdf(
  rows: { producto_nombre: string; stock: number; costo_unitario: number; inversion: number }[],
  totalUnidades: number,
  totalInversion: number,
  scope: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.31, 0.68, 0.70);
  const dark = rgb(0.15, 0.18, 0.22);
  const gray = rgb(0.45, 0.48, 0.52);

  const pageW = 595.28, pageH = 841.89; // A4
  const mL = 40, mR = 40;
  // Columnas: Producto | Stock | Costo | Inversión
  const cols = [
    { x: mL, w: 230, align: "left" as const, label: "Producto" },
    { x: mL + 240, w: 70, align: "right" as const, label: "Stock" },
    { x: mL + 320, w: 90, align: "right" as const, label: "Costo unit." },
    { x: mL + 420, w: 95, align: "right" as const, label: "Inversión" },
  ];

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - 50;

  const text = (s: string, x: number, yy: number, f = font, size = 9, color = dark) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const textRight = (s: string, xRight: number, yy: number, f = font, size = 9, color = dark) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: yy, size, font: f, color });
  };
  const clip = (s: string, maxW: number, size = 9) => {
    let t = s;
    while (t.length > 3 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    return t === s ? s : t.slice(0, -1) + "…";
  };

  // Encabezado
  text("Stock de mercadería e inversión", mL, y, bold, 16);
  y -= 18;
  text(scope, mL, y, font, 10, gray);
  y -= 13;
  text(`Generado: ${new Date().toLocaleString("es-PY")}`, mL, y, font, 9, gray);
  y -= 22;

  const drawHeader = () => {
    page.drawRectangle({ x: mL, y: y - 4, width: pageW - mL - mR, height: 18, color: teal });
    for (const c of cols) {
      if (c.align === "left") text(c.label, c.x + 4, y, bold, 9, rgb(1, 1, 1));
      else textRight(c.label, c.x + c.w - 4, y, bold, 9, rgb(1, 1, 1));
    }
    y -= 22;
  };
  drawHeader();

  for (const r of rows) {
    if (y < 70) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - 50;
      drawHeader();
    }
    text(clip(r.producto_nombre, cols[0].w - 6), cols[0].x + 4, y);
    textRight(r.stock.toLocaleString("es-PY"), cols[1].x + cols[1].w - 4, y);
    textRight(gs(r.costo_unitario), cols[2].x + cols[2].w - 4, y);
    textRight(gs(r.inversion), cols[3].x + cols[3].w - 4, y, bold);
    y -= 15;
    page.drawLine({ start: { x: mL, y: y + 4 }, end: { x: pageW - mR, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });
  }

  // Totales
  y -= 8;
  page.drawRectangle({ x: mL, y: y - 4, width: pageW - mL - mR, height: 18, color: rgb(0.93, 0.97, 0.97) });
  text("TOTAL", cols[0].x + 4, y, bold, 10);
  textRight(totalUnidades.toLocaleString("es-PY") + " u.", cols[1].x + cols[1].w - 4, y, bold, 10);
  textRight(gs(totalInversion), cols[3].x + cols[3].w - 4, y, bold, 10);

  return doc.save();
}
