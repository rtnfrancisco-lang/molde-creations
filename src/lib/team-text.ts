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
  align?: "left" | "center" | "right";
  /** Ponto que fica fixo quando o texto do campo muda. Ausente = "centro". */
  fieldAnchor?: FieldAnchor;
};
export type FieldAnchor = "esquerda" | "centro" | "direita";
export type ResolvedTeamText = {
  text: string; x: number; y: number; fontSize: number;
  align?: "left" | "center" | "right"; left?: number; right?: number;
};

const viewDims = (m: Dims, view: TeamView) =>
  view === "frente" || view === "costas" ? { w: m.bodyWidth, h: m.bodyHeight } : { w: m.sleeveWidth, h: m.sleeveHeight };

/** Escala da vista entre o molde mãe e o tamanho pedido. */
export function teamScale<S extends string>(table: Record<S, Dims>, mother: S, size: S, view: TeamView): { sx: number; sy: number } {
  const a = viewDims(table[mother], view);
  const b = viewDims(table[size], view);
  return { sx: a.w > 0 ? b.w / a.w : 1, sy: a.h > 0 ? b.h / a.h : 1 };
}

/** Texto final de um elemento. null = o texto some. fontSize nas mesmas unidades do TextElement.
 *  Campos do time ficam ancorados no ponto fixo da caixa do texto de exemplo, com a linha de base preservada. */
export function resolveTeamText(
  t: TeamTextInput,
  o: { value: string | null; sx: number; sy: number; measure: (text: string, font: TeamFont) => number },
): ResolvedTeamText | null {
  if (!t.field) return { text: t.text, x: t.x, y: t.y, fontSize: t.fontSize };
  if (o.value == null || o.value === "") return null;
  const up = t.field === "nome" && !!t.upper;
  const k = t.scaleWithSize ? o.sx : 1;
  const ky = t.scaleWithSize ? o.sy : 1;
  const width = (s: string, fs: number) => {
    const font = { family: t.fontFamily, size: fs / 10, bold: t.bold, italic: t.italic };
    return Math.max(0, ...s.split("\n").map((line) => o.measure(line, font)));
  };
  const fs0 = t.fontSize;
  const sample = up ? t.text.toUpperCase() : t.text;
  const w0 = width(sample, fs0);
  const align = t.align ?? "left";
  const L0 = align === "left" ? t.x : align === "center" ? t.x - w0 / 2 : t.x - w0;
  const anchor: FieldAnchor = t.fieldAnchor ?? "centro";
  const P = (anchor === "esquerda" ? L0 : anchor === "direita" ? L0 + w0 : L0 + w0 / 2) * k;
  let fs = fs0 * k;
  const B = t.y * ky + fs / 10;
  const text = up ? o.value.toUpperCase() : o.value;
  let w1 = width(text, fs);
  if (t.fitWidth && t.fitWidth > 0 && w1 > t.fitWidth * k && w1 > 0) {
    fs = fs * ((t.fitWidth * k) / w1);
    w1 = t.fitWidth * k;
  }
  const left = anchor === "centro" ? P - w1 / 2 : anchor === "esquerda" ? P : P - w1;
  return {
    text, x: P, y: B - fs / 10, fontSize: fs,
    align: anchor === "centro" ? "center" : anchor === "esquerda" ? "left" : "right",
    left, right: left + w1,
  };
}

/** true quando o texto resolvido passa da largura W da peça (x centrado em 0). */
export const teamTextOverflows = (r: ResolvedTeamText | null, W: number) =>
  !!r && r.left != null && r.right != null && (r.left < -W / 2 || r.right > W / 2);

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
