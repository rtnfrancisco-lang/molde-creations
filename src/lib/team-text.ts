/* Troca e ajuste dos textos "campo do time" — funções puras, reutilizadas pela pré-visualização e pela exportação do time. */

export type TeamView = "frente" | "costas" | "mangaEsq" | "mangaDir";
type Dims = { bodyWidth: number; bodyHeight: number; sleeveWidth: number; sleeveHeight: number };
export type TeamFont = { family: string; size: number; bold: boolean; italic: boolean };
export type TeamTextInput = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  field?: "nome" | "numero";
  upper?: boolean;
  fitWidth?: number | undefined;
  scaleWithSize?: boolean;
};

const viewDims = (m: Dims, view: TeamView) =>
  view === "frente" || view === "costas" ? { w: m.bodyWidth, h: m.bodyHeight } : { w: m.sleeveWidth, h: m.sleeveHeight };

/** Escala da vista entre o molde mãe e o tamanho pedido. */
export function teamScale<S extends string>(table: Record<S, Dims>, mother: S, size: S, view: TeamView): { sx: number; sy: number } {
  const a = viewDims(table[mother], view);
  const b = viewDims(table[size], view);
  return { sx: a.w > 0 ? b.w / a.w : 1, sy: a.h > 0 ? b.h / a.h : 1 };
}

/** Texto final de um elemento. null = o texto some. fontSize nas mesmas unidades do TextElement. */
export function resolveTeamText(
  t: TeamTextInput,
  o: { value: string | null; sx: number; sy: number; measure: (text: string, font: TeamFont) => number },
): { text: string; x: number; y: number; fontSize: number } | null {
  if (!t.field) return { text: t.text, x: t.x, y: t.y, fontSize: t.fontSize };
  if (o.value == null || o.value === "") return null;
  const text = t.field === "nome" && t.upper ? o.value.toUpperCase() : o.value;
  const scale = !!t.scaleWithSize;
  let fontSize = scale ? t.fontSize * o.sx : t.fontSize;
  const x = scale ? t.x * o.sx : t.x;
  const y = scale ? t.y * o.sy : t.y;
  if (t.fitWidth && t.fitWidth > 0) {
    const max = t.fitWidth * (scale ? o.sx : 1);
    const font = { family: t.fontFamily, size: fontSize / 10, bold: t.bold, italic: t.italic };
    const w = Math.max(0, ...text.split("\n").map((line) => o.measure(line, font)));
    if (w > max && w > 0) fontSize = fontSize * (max / w);
  }
  return { text, x, y, fontSize };
}

let ctx: CanvasRenderingContext2D | null = null;
/** Largura do texto em cm (font.size em cm, como no canvas). */
export function measureText(text: string, font: TeamFont): number {
  if (typeof document === "undefined") return 0;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  const REF = 100;
  ctx.font = `${font.italic ? "italic " : ""}${font.bold ? "700 " : "400 "}${REF}px ${font.family}`;
  return (ctx.measureText(text).width * font.size) / REF;
}

/** Aguarda as fontes antes de medir. */
export const fontsReady = (): Promise<unknown> =>
  typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
