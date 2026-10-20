/** Alinhamento estilo CorelDRAW: funções puras em cm (x de -W/2 a W/2, y de 0 a H). */
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type AlignOp = "left" | "right" | "top" | "bottom" | "centerX" | "centerY" | "center";
export type AlignMode = "objects" | "mold";
export type AlignRefKind = "last" | "first" | "group";

/** Caixa que cobre um retângulo aw × ah girado por rot graus, centrado em (cx, cy). */
export function rotatedBox(cx: number, cy: number, aw: number, ah: number, rot = 0): Box {
  const t = (rot * Math.PI) / 180;
  const bw = Math.abs(aw * Math.cos(t)) + Math.abs(ah * Math.sin(t));
  const bh = Math.abs(aw * Math.sin(t)) + Math.abs(ah * Math.cos(t));
  return { x0: cx - bw / 2, y0: cy - bh / 2, x1: cx + bw / 2, y1: cy + bh / 2 };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/** Caixa de referência para "Entre objetos" (boxes em ordem de seleção: o último é o principal). */
export function objectsRef(boxes: Box[], kind: AlignRefKind): Box | null {
  if (!boxes.length) return null;
  if (kind === "first") return boxes[0]!;
  if (kind === "group") return unionBox(boxes);
  return boxes[boxes.length - 1]!;
}

/** Deslocamento (dx, dy) de cada caixa para alinhá-la à referência. */
export function alignDeltas(boxes: Box[], op: AlignOp, _mode: AlignMode, ref: Box): { dx: number; dy: number }[] {
  const rcx = (ref.x0 + ref.x1) / 2;
  const rcy = (ref.y0 + ref.y1) / 2;
  return boxes.map((b) => {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    switch (op) {
      case "left": return { dx: ref.x0 - b.x0, dy: 0 };
      case "right": return { dx: ref.x1 - b.x1, dy: 0 };
      case "top": return { dx: 0, dy: ref.y0 - b.y0 };
      case "bottom": return { dx: 0, dy: ref.y1 - b.y1 };
      case "centerX": return { dx: rcx - cx, dy: 0 };
      case "centerY": return { dx: 0, dy: rcy - cy };
      case "center": return { dx: rcx - cx, dy: rcy - cy };
    }
  });
}

/** Tecla → operação (L R T B E C P). */
export const ALIGN_KEYS: Record<string, AlignOp> = { l: "left", r: "right", t: "top", b: "bottom", e: "centerX", c: "centerY", p: "center" };
