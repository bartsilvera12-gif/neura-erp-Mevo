import "server-only";

import { createHash } from "node:crypto";
import {
  mergeCustomTemplateFields,
  type SorteoTicketImageConfig,
} from "@/lib/sorteos/sorteo-ticket-types";
import { measureTicketText, svgTextAsPath } from "@/lib/sorteos/sorteo-ticket-text-path";

export type SorteoTicketRenderInput = {
  empresaNombre: string;
  sorteoNombre: string;
  clienteNombre?: string;
  documento?: string;
  telefono?: string;
  numeroOrden: string;
  cupones: string[];
  /** ISO o texto localizable */
  fechaHora: string;
  config: SorteoTicketImageConfig;
  /** bytes PNG/JPEG/WebP o null */
  logoBytes: Buffer | null;
  logoMime: string | null;
  backgroundBytes: Buffer | null;
  backgroundMime: string | null;
  /** Plantilla completa (custom_template) */
  templateBytes?: Buffer | null;
  templateMime?: string | null;
};

/** Canvas modo automático — comprobante vertical premium */
const WA = 1080;
const HA = 1350;

function dataUrlFromBuffer(buf: Buffer, mime: string): string {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

/** Paleta del comprobante: papel cálido, tinta casi negra, hairlines suaves. */
const PAPER = "#F2F1EE";
const INK = "#16150F";
const MUTED = "#8B887E";
const HAIRLINE = "#D9D6CE";

/** Reduce el tamaño hasta que el texto entre en `maxW` (mínimo `min`). */
function fitFontSize(
  text: string,
  weight: number,
  desired: number,
  maxW: number,
  min: number,
  letterSpacing = 0
): number {
  let size = desired;
  while (size > min && measureTicketText({ text, fontSize: size, weight, letterSpacing }) > maxW) {
    size -= 2;
  }
  return size;
}

/** Versalita con tracking para las etiquetas de la ficha. */
function labelSvg(text: string, x: number, y: number): string {
  return svgTextAsPath({
    text: text.toUpperCase(),
    x,
    y,
    fontSize: 19,
    weight: 600,
    fill: MUTED,
    letterSpacing: 2.6,
  });
}

function hairline(x1: number, x2: number, y: number, color = HAIRLINE): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`;
}

/**
 * Bloque de cupones: cierre tipográfico. Una fila si entran; si no, se reparte
 * en varias líneas reduciendo el cuerpo. Numeración tabular, sin recuadros.
 */
function cuponesBlockSvg(
  cupones: string[],
  xLeft: number,
  maxW: number,
  yBaseline: number
): { svg: string; bottom: number } {
  if (cupones.length === 0) {
    return {
      svg: svgTextAsPath({ text: "—", x: xLeft, y: yBaseline, fontSize: 96, weight: 800, fill: INK }),
      bottom: yBaseline + 24,
    };
  }

  const GAP_RATIO = 0.42;
  const MAX_SIZE = 132;
  /** Debajo de esto los números dejan de leerse como cierre y conviene partir en filas. */
  const MIN_SIZE_UNA_FILA = 68;
  const MIN_SIZE = 44;

  const anchoFila = (n: number, fs: number) => {
    const w = cupones
      .slice(0, n)
      .reduce((acc, c) => acc + measureTicketText({ text: c, fontSize: fs, weight: 800 }), 0);
    return w + fs * GAP_RATIO * Math.max(0, n - 1);
  };

  /** 1) Primero achicar para mantenerlos en una sola fila. */
  let perRow = cupones.length;
  let size = MAX_SIZE;
  while (size > MIN_SIZE_UNA_FILA && anchoFila(perRow, size) > maxW) size -= 2;

  /** 2) Si aun así no entran, recién ahí repartir en filas. */
  if (anchoFila(perRow, size) > maxW) {
    while (perRow > 1 && anchoFila(perRow, size) > maxW) perRow -= 1;
    while (size > MIN_SIZE && anchoFila(perRow, size) > maxW) size -= 2;
  }
  if (perRow < 1) perRow = 1;

  const filas: string[][] = [];
  for (let i = 0; i < cupones.length; i += perRow) filas.push(cupones.slice(i, i + perRow));

  const lineH = size * 1.12;
  const parts: string[] = [];
  filas.forEach((fila, fi) => {
    let x = xLeft;
    const y = yBaseline + fi * lineH;
    for (const c of fila) {
      parts.push(svgTextAsPath({ text: c, x, y, fontSize: size, weight: 800, fill: INK }));
      x += measureTicketText({ text: c, fontSize: size, weight: 800 }) + size * GAP_RATIO;
    }
  });

  return {
    svg: parts.join("\n  "),
    /** Base de la última fila + descendente aproximado. */
    bottom: yBaseline + (filas.length - 1) * lineH + size * 0.26,
  };
}

/**
 * Comprobante de participación — un solo bloque de papel.
 * Encabezado con marca, nombre como protagonista, datos en filas de hairlines,
 * perforación y los cupones como cierre. Sin tarjetas ni recuadros.
 */
export function buildSorteoTicketSvg(input: SorteoTicketRenderInput): string {
  const cfg = input.config;
  const bg = (cfg.backgroundColor ?? PAPER).trim();
  const primary = (cfg.primaryColor ?? INK).trim();
  const secondary = (cfg.secondaryColor ?? MUTED).trim();
  const title = (cfg.title ?? "Comprobante de participación").trim();
  const footer = (cfg.legalFooter ?? "").trim();

  const showLogo = cfg.showLogo !== false;
  const showNombre = cfg.showClienteNombre !== false;
  const showDoc = cfg.showDocumento !== false;
  const showTel = cfg.showTelefono !== false;
  const showOrd = cfg.showNumeroOrden !== false;
  const showCup = cfg.showCupones !== false;
  const showSorteoNom = cfg.showSorteoNombre !== false;

  const M = 88;
  const colW = WA - M * 2;

  let bgPattern = "";
  if (input.backgroundBytes && input.backgroundMime) {
    const href = dataUrlFromBuffer(input.backgroundBytes, input.backgroundMime);
    bgPattern = `<image href="${href}" x="0" y="0" width="${WA}" height="${HA}" preserveAspectRatio="xMidYMid slice" opacity="0.06"/>`;
  }

  /* ── Encabezado: marca a la izquierda, tipo de documento a la derecha ── */
  const yMarca = 148;
  let marca = "";
  if (showLogo && input.logoBytes && input.logoMime) {
    const href = dataUrlFromBuffer(input.logoBytes, input.logoMime);
    marca = `<image href="${href}" x="${M}" y="${yMarca - 52}" width="190" height="64" preserveAspectRatio="xMinYMid meet"/>`;
  } else if (showLogo) {
    marca = svgTextAsPath({
      text: (input.empresaNombre || "mevo").trim().toLowerCase(),
      x: M,
      y: yMarca,
      fontSize: 52,
      weight: 800,
      fill: primary,
      letterSpacing: -1.2,
    });
  }

  const tituloSize = fitFontSize(title.toUpperCase(), 600, 19, colW * 0.56, 13, 2.6);
  const header = `${marca}
  ${svgTextAsPath({
    text: title.toUpperCase(),
    x: WA - M,
    y: yMarca - 4,
    fontSize: tituloSize,
    weight: 600,
    fill: secondary,
    textAnchor: "end",
    letterSpacing: 2.6,
  })}
  ${hairline(M, WA - M, yMarca + 34)}`;

  /* ── Protagonista: el nombre ── */
  let y = yMarca + 34;
  let bloqueNombre = "";
  if (showNombre && input.clienteNombre?.trim()) {
    const nombre = input.clienteNombre.trim();
    const size = fitFontSize(nombre, 800, 92, colW, 40, -1.5);
    y += 132;
    bloqueNombre += svgTextAsPath({
      text: nombre,
      x: M,
      y,
      fontSize: size,
      weight: 800,
      fill: primary,
      letterSpacing: -1.5,
    });
  }

  const sub: string[] = [];
  if (showDoc && input.documento?.trim()) sub.push(`Doc. ${input.documento.trim()}`);
  if (showTel && input.telefono?.trim()) sub.push(`Tel. ${input.telefono.trim()}`);
  if (sub.length > 0) {
    y += 48;
    const linea = sub.join("  ·  ");
    bloqueNombre += svgTextAsPath({
      text: linea,
      x: M,
      y,
      fontSize: fitFontSize(linea, 400, 30, colW, 20),
      weight: 400,
      fill: secondary,
    });
  }

  /* ── Ficha: etiqueta a la izquierda, dato a la derecha, hairline debajo ── */
  const filas: { label: string; value: string }[] = [];
  if (showSorteoNom && input.sorteoNombre?.trim()) {
    filas.push({ label: "Sorteo", value: input.sorteoNombre.trim() });
  }
  if (showOrd && String(input.numeroOrden ?? "").trim()) {
    filas.push({ label: "Nº de orden", value: String(input.numeroOrden).trim() });
  }
  if (input.fechaHora?.trim()) {
    filas.push({ label: "Fecha", value: input.fechaHora.trim() });
  }

  const xValor = M + 210;
  const anchoValor = WA - M - xValor;
  let fichaSvg = "";
  y += 76;
  for (const f of filas) {
    y += 62;
    fichaSvg += labelSvg(f.label, M, y - 4) + "\n  ";
    fichaSvg += svgTextAsPath({
      text: f.value,
      x: xValor,
      y,
      fontSize: fitFontSize(f.value, 400, 34, anchoValor, 20),
      weight: 400,
      fill: primary,
    });
    y += 30;
    fichaSvg += "\n  " + hairline(M, WA - M, y);
  }

  /* ── Perforación + cupones ── */
  let cierre = "";
  if (showCup) {
    y += 74;
    cierre += `<line x1="${M}" y1="${y}" x2="${WA - M}" y2="${y}" stroke="${secondary}" stroke-width="2" stroke-dasharray="9 11" opacity="0.65"/>`;
    y += 66;
    cierre += "\n  " + labelSvg("Cupones", M, y);
    cierre +=
      "\n  " +
      svgTextAsPath({
        text: String(input.cupones.length).padStart(2, "0"),
        x: WA - M,
        y,
        fontSize: 19,
        weight: 600,
        fill: secondary,
        textAnchor: "end",
        letterSpacing: 2.6,
      });

    const bloque = cuponesBlockSvg(input.cupones, M, colW, y + 118);
    cierre += "\n  " + bloque.svg;
    y = bloque.bottom;
  }

  /**
   * Con pocos cupones el bloque queda arriba y sobra papel abajo. Se baja el
   * cuerpo (no el encabezado) para repartir el aire; con muchos cupones el
   * desplazamiento tiende a cero solo.
   */
  const margenInferior = footer ? 150 : 104;
  const sobra = HA - margenInferior - y;
  const dy = Math.max(0, Math.min(sobra * 0.5, 220));

  const pie = footer
    ? svgTextAsPath({
        text: footer,
        x: M,
        y: HA - 74,
        fontSize: fitFontSize(footer, 400, 21, colW, 14),
        weight: 400,
        fill: secondary,
      })
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WA}" height="${HA}" viewBox="0 0 ${WA} ${HA}">
  <rect x="0" y="0" width="${WA}" height="${HA}" fill="${fillAttr(bg)}"/>
  ${bgPattern}
  ${header}
  <g transform="translate(0 ${dy.toFixed(1)})">
  ${bloqueNombre}
  ${fichaSvg}
  ${cierre}
  </g>
  ${pie}
</svg>`;
}

function fillAttr(color: string): string {
  const t = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t) || /^#[0-9A-Fa-f]{3}$/.test(t)) return t;
  return "#111827";
}

/**
 * Plantilla personalizada: datos del cliente bajo el logo y centrados como el cupón; tamaño del cupón sin tocar.
 * Colores desde mergeCustomTemplateFields. 1–6 cupones: centrados; más de 6: grilla.
 */
function buildCustomTemplateOverlaySvg(
  w: number,
  h: number,
  input: SorteoTicketRenderInput,
  layout: ReturnType<typeof mergeCustomTemplateFields>
): string {
  const padX = Math.max(40, Math.min(layout.cliente_nombre?.x ?? 72, w * 0.2));
  const bottomPad = Math.max(36, Math.round(h * 0.028));
  /**
   * Inicio del bloque de datos (coord. Y antes del primer baseline).
   * El logo va **dentro del PNG**: sin segmentación no hay bbox; un ratio bajo
   * solapa el texto con el arte. ~39% del alto suele quedar debajo de logos grandes tipo story.
   */
  const metaTop = Math.round(h * 0.39);

  const colName = fillAttr(layout.cliente_nombre.color);
  const colDoc = fillAttr(layout.cliente_documento.color);
  const colTel = fillAttr(layout.telefono.color);
  const colOrd = fillAttr(layout.numero_orden.color);
  const colSort = fillAttr(layout.sorteo_nombre.color);
  const colCup = fillAttr(layout.cupones.color);

  const cupones = input.cupones ?? [];
  const metaGap = 14;
  const blockGap = 22;

  type MetaRow = { text: string; fs: number; color: string; weight: number };
  const buildMetaRows = (metaScale: number): MetaRow[] => {
    const r = (n: number) => Math.max(16, Math.round(n * metaScale));
    const rows: MetaRow[] = [];
    const cn = input.clienteNombre?.trim();
    if (cn) {
      rows.push({
        text: cn,
        fs: r(Math.max(layout.cliente_nombre.fontSize, 34)),
        color: colName,
        weight: 700,
      });
    }
    const doc = input.documento?.trim();
    if (doc) {
      rows.push({
        text: `Documento: ${doc}`,
        fs: r(Math.max(layout.cliente_documento.fontSize, 28)),
        color: colDoc,
        weight: 600,
      });
    }
    const tel = input.telefono?.trim();
    if (tel) {
      rows.push({
        text: `Teléfono: ${tel}`,
        fs: r(Math.max(layout.telefono.fontSize, 28)),
        color: colTel,
        weight: 600,
      });
    }
    const ord = String(input.numeroOrden ?? "").trim();
    if (ord) {
      rows.push({
        text: `Nº orden: ${ord}`,
        fs: r(Math.max(layout.numero_orden.fontSize, 34)),
        color: colOrd,
        weight: 700,
      });
    }
    const sn = input.sorteoNombre?.trim();
    if (sn) {
      rows.push({
        text: `Sorteo: ${sn}`,
        fs: r(Math.max(layout.sorteo_nombre.fontSize, 28)),
        color: colSort,
        weight: 600,
      });
    }
    return rows;
  };

  /** Altura del layout de cupones (el tamaño del número **no** usa metaScale). */
  const simulateLastCupBaseline = (yAfterMeta: number): number => {
    let y = yAfterMeta;
    if (cupones.length === 0) return y;
    if (cupones.length <= 6) {
      const fs = Math.min(
        84,
        Math.max(52, Math.round(layout.cupones.fontSize + (6 - Math.min(cupones.length, 6)) * 3))
      );
      const step = Math.round(fs * 1.2);
      for (let i = 0; i < cupones.length; i++) {
        y += step;
      }
      return y;
    }
    const cols = 3;
    const fs = 22;
    const rowH = 34;
    const maxShow = 24;
    const list = cupones.slice(0, maxShow);
    const gy = y + fs + 4;
    let maxY = gy;
    for (let i = 0; i < list.length; i++) {
      const row = Math.floor(i / cols);
      const yCell = gy + row * rowH;
      if (yCell > maxY) maxY = yCell;
    }
    if (cupones.length > maxShow) {
      maxY += Math.ceil(list.length / cols) * rowH + 8;
      maxY += 22;
    }
    return maxY;
  };

  let metaScale = 1.06;
  let metaRows = buildMetaRows(metaScale);
  for (let iter = 0; iter < 22; iter++) {
    metaRows = buildMetaRows(metaScale);
    let ySim = metaTop;
    for (const row of metaRows) {
      ySim += row.fs + metaGap;
    }
    ySim += blockGap - metaGap;
    const lastY = simulateLastCupBaseline(ySim);
    if (lastY <= h - bottomPad || metaScale <= 0.56) {
      break;
    }
    metaScale *= 0.93;
  }

  const cx = w / 2;
  const pieces: string[] = [];
  let y = metaTop;
  for (const row of metaRows) {
    y += row.fs;
    pieces.push(
      svgTextAsPath({
        text: row.text,
        x: cx,
        y,
        fontSize: row.fs,
        weight: row.weight,
        fill: fillAttr(row.color),
        textAnchor: "middle",
      })
    );
    y += metaGap;
  }
  y += blockGap - metaGap;

  if (cupones.length === 0) {
    /* Sin cupones resueltos: no dibujar placeholder */
  } else if (cupones.length <= 6) {
    const fs = Math.min(
      84,
      Math.max(52, Math.round(layout.cupones.fontSize + (6 - Math.min(cupones.length, 6)) * 3))
    );
    const step = Math.round(fs * 1.2);
    for (let i = 0; i < cupones.length; i++) {
      y += step;
      pieces.push(
        svgTextAsPath({
          text: cupones[i]!,
          x: cx,
          y,
          fontSize: fs,
          weight: 800,
          fill: colCup,
          textAnchor: "middle",
        })
      );
    }
  } else {
    const cols = 3;
    const cellW = (w - 2 * padX) / cols;
    const fs = 22;
    const rowH = 34;
    const maxShow = 24;
    const list = cupones.slice(0, maxShow);
    let gy = y + fs + 4;
    for (let i = 0; i < list.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xCell = padX + col * cellW + cellW / 2;
      const yCell = gy + row * rowH;
      pieces.push(
        svgTextAsPath({
          text: list[i]!,
          x: xCell,
          y: yCell,
          fontSize: fs,
          weight: 700,
          fill: colCup,
          textAnchor: "middle",
        })
      );
    }
    if (cupones.length > maxShow) {
      gy += Math.ceil(list.length / cols) * rowH + 8;
      pieces.push(
        svgTextAsPath({
          text: `+${cupones.length - maxShow} más`,
          x: cx,
          y: gy,
          fontSize: 18,
          weight: 600,
          fill: colCup,
          textAnchor: "middle",
        })
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${pieces.filter(Boolean).join("\n")}
</svg>`;
}

async function renderCustomTemplateTicketPng(input: SorteoTicketRenderInput): Promise<Buffer> {
  const buf = input.templateBytes!;
  const sharpMod = (await import("sharp")).default;
  const meta = await sharpMod(buf).metadata();
  const w = meta.width && meta.width > 0 ? meta.width : input.config.custom_template_width ?? 1080;
  const h = meta.height && meta.height > 0 ? meta.height : input.config.custom_template_height ?? 1350;

  const fields = mergeCustomTemplateFields(input.config);
  const overlaySvg = buildCustomTemplateOverlaySvg(w, h, input, fields);
  const overlayPng = await sharpMod(Buffer.from(overlaySvg, "utf8")).png().toBuffer();

  const baseRgb = await sharpMod(buf)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

  return sharpMod(baseRgb)
    .composite([{ input: overlayPng, left: 0, top: 0, blend: "over" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function renderSorteoTicketPng(svg: string): Promise<{ png: Buffer; hash: string }> {
  const sharpMod = (await import("sharp")).default;
  const png = await sharpMod(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
  const hash = createHash("sha256").update(png).digest("hex");
  return { png, hash };
}

/**
 * Punto único: plantilla personalizada (imagen + texto) o automático (SVG premium).
 */
export async function renderTicketPngUnified(input: SorteoTicketRenderInput): Promise<{ png: Buffer; hash: string }> {
  const hasTemplate =
    input.templateBytes && input.templateBytes.length > 0 && input.templateMime;
  if (hasTemplate) {
    try {
      const png = await renderCustomTemplateTicketPng(input);
      const hash = createHash("sha256").update(png).digest("hex");
      return { png, hash };
    } catch (e) {
      console.warn("[sorteo-ticket-render] custom_template_failed_fallback_auto", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const svg = buildSorteoTicketSvg(input);
  return renderSorteoTicketPng(svg);
}
