/**
 * Detección robusta de "intención de compra" en mensajes de WhatsApp (texto o título de botón).
 *
 * Objetivo: reconocer variantes y errores de tipeo SIN mantener listas exhaustivas, y sin
 * confundir con palabras del flujo (sobre todo "comprobante").
 *
 * Estrategia:
 *  - Normaliza (minúsculas, sin acentos, sin signos, espacios colapsados).
 *  - Frases multi-palabra (substring): "otra vez", "quiero otro", "volver a comprar", etc.
 *  - Raíces por token (prefijo): `compra`, `bolet`, `particip`, `numero`, `ticket`.
 *      · Se usa `compra` (NO `compr` pelado) a propósito: "comprobante" empieza con "compro",
 *        así que nunca matchea por raíz. Cubre compra/comprar/comprando/comprame/compras…
 *  - Tolerancia a typos: Levenshtein ≤ 1 contra palabras base, solo en tokens de largo ≥ 5
 *    (evita falsos positivos en palabras cortas). Cubre komprar, conprar, comprr, compre, boletp…
 */

export function normalizePurchaseIntentText(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raíces seguras (prefijo de token). "compra" excluye "comprobante" por construcción. */
const INTENT_ROOTS = ["compra", "bolet", "particip", "numero", "ticket"] as const;

/** Frases multi-palabra que no se capturan por raíz de un solo token. */
const INTENT_PHRASES = [
  "otra vez",
  "quiero otro",
  "quiero otra",
  "otro boleto",
  "otra boleta",
  "volver a comprar",
  "mas numeros",
  "mas boletas",
] as const;

/** Palabras base para tolerancia a typos (Levenshtein ≤ 1, solo tokens de largo ≥ 5). */
const INTENT_FUZZY_WORDS = [
  "comprar",
  "compra",
  "boleto",
  "boleta",
  "boletos",
  "boletas",
  "participar",
  "numeros",
] as const;

const FUZZY_MIN_TOKEN_LEN = 5;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * ¿El texto expresa intención de comprar (de nuevo)?
 * Pensado como señal "soft": el llamador debe seguir respetando los guards (no reiniciar en
 * pasos de captura sensibles, no en modo humano, etc.).
 */
export function matchesPurchaseIntent(text: string | null | undefined): boolean {
  const n = normalizePurchaseIntentText(text ?? "");
  if (!n) return false;

  for (const phrase of INTENT_PHRASES) {
    if (n === phrase || n.includes(phrase)) return true;
  }

  const tokens = n.split(" ").filter(Boolean);
  for (const tok of tokens) {
    if (INTENT_ROOTS.some((r) => tok.startsWith(r))) return true;
    if (tok.length >= FUZZY_MIN_TOKEN_LEN) {
      for (const w of INTENT_FUZZY_WORDS) {
        if (Math.abs(tok.length - w.length) <= 1 && levenshtein(tok, w) <= 1) return true;
      }
    }
  }
  return false;
}
