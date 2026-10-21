/* Desenho livre (Caneta) e Formas: geram camadas vetoriais independentes do molde. */
import type { Layer, LNode, P } from "./importers";

export type PenMode = "livre" | "bezier";
export type ShapeKind =
  | "retangulo"
  | "arredondado"
  | "elipse"
  | "triangulo"
  | "losango"
  | "pentagono"
  | "hexagono"
  | "estrela"
  | "seta"
  | "linha";

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  retangulo: "Retângulo",
  arredondado: "Retângulo arredondado",
  elipse: "Círculo",
  triangulo: "Triângulo",
  losango: "Losango",
  pentagono: "Pentágono",
  hexagono: "Hexágono",
  estrela: "Estrela",
  seta: "Seta",
  linha: "Linha",
};

export type DrawOpts = {
  penMode: PenMode;
  penStroke: string;
  penWidth: number;
  shape: ShapeKind;
  shapeStroke: string;
  shapeWidth: number;
  shapeFill: string | null;
};

export const DEFAULT_DRAW_OPTS: DrawOpts = {
  penMode: "livre",
  penStroke: "#111827",
  penWidth: 0.1,
  shape: "retangulo",
  shapeStroke: "#111827",
  shapeWidth: 0.1,
  shapeFill: null,
};

/** Nó em cm (alças relativas, em cm). */
export type CmNode = { x: number; y: number; smooth: boolean; hIn?: P; hOut?: P };

/** Ramer–Douglas–Peucker. */
export function rdp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  let idx = -1;
  let best = 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d =
      len < 1e-9
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > best) {
      best = d;
      idx = i;
    }
  }
  if (best <= tol || idx < 0) return [a, b];
  const l = rdp(pts.slice(0, idx + 1), tol);
  const r = rdp(pts.slice(idx), tol);
  return [...l.slice(0, -1), ...r];
}

/** Remove nós consecutivos coincidentes (ex.: duplo clique). */
export function dedupe(nodes: CmNode[], eps = 0.05): CmNode[] {
  const out: CmNode[] = [];
  for (const n of nodes) {
    const l = out[out.length - 1];
    if (l && Math.hypot(l.x - n.x, l.y - n.y) < eps) {
      if (n.hOut) l.hOut = n.hOut;
      continue;
    }
    out.push({ ...n });
  }
  return out;
}

/** Monta uma Layer vetorial a partir de nós em cm (sistema do canvas: x centrado, y a partir do ombro). */
export function layerFromCm(
  nodes: CmNode[],
  closed: boolean,
  style: { stroke: string | null; fill: string | null; widthCm: number },
  name: string,
  W: number,
  H: number,
): Layer | null {
  if (nodes.length < 2) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  nodes.forEach((n) => {
    add(n.x, n.y);
    if (n.hIn) add(n.x + n.hIn.x, n.y + n.hIn.y);
    if (n.hOut) add(n.x + n.hOut.x, n.y + n.hOut.y);
  });
  let bw = x1 - x0;
  let bh = y1 - y0;
  if (bw < 1e-6 && bh < 1e-6) return null;
  // Linha perfeitamente vertical: garante largura mínima centralizada.
  if (bw < bh * 0.01) {
    const nw = bh * 0.01;
    x0 -= (nw - bw) / 2;
    bw = nw;
  }
  if (bh < bw * 0.01) {
    const nh = bw * 0.01;
    y0 -= (nh - bh) / 2;
    bh = nh;
  }
  const ln: LNode[] = nodes.map((n) => {
    const o: LNode = { x: (n.x - x0) / bw, y: (n.y - y0) / bh, smooth: n.smooth };
    if (n.hIn) o.hIn = { x: n.hIn.x / bw, y: n.hIn.y / bh };
    if (n.hOut) o.hOut = { x: n.hOut.x / bw, y: n.hOut.y / bh };
    return o;
  });
  const cxCm = x0 + bw / 2;
  const cyCm = y0 + bh / 2;
  return {
    id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    kind: "vetor",
    paths: [
      {
        subs: [{ nodes: ln, closed }],
        fill: closed ? style.fill : null,
        stroke: style.stroke,
        sw: style.widthCm / bw,
        rule: "nonzero",
      },
    ],
    cx: cxCm / W + 0.5,
    cy: cyCm / H,
    w: bw / W,
    ratio: bh / bw,
    rot: 0,
  };
}

/** Próximo nome livre, ex.: "Desenho 3". */
export function nextName(prefix: string, existing: { name: string }[]) {
  let n = 0;
  const re = new RegExp("^" + prefix + " (\\d+)$");
  existing.forEach((l) => {
    const m = re.exec(l.name);
    if (m) n = Math.max(n, Number(m[1]));
  });
  return `${prefix} ${n + 1}`;
}

/** Caixa do arrasto com Shift (proporcional) e Alt (a partir do centro). */
export function dragRect(s: P, p: P, shift: boolean, alt: boolean) {
  let dx = p.x - s.x;
  let dy = p.y - s.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  const a = alt ? { x: s.x - dx, y: s.y - dy } : s;
  const b = { x: s.x + dx, y: s.y + dy };
  return {
    a,
    b,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

const K = 0.5523;
const poly = (pts: P[]): CmNode[] => pts.map((p) => ({ x: p.x, y: p.y, smooth: false }));

/** Nós (em cm) da forma dentro da caixa. Retorna também se é fechada. */
export function shapeNodes(
  kind: ShapeKind,
  r: ReturnType<typeof dragRect>,
): { nodes: CmNode[]; closed: boolean } {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const regular = (n: number, start: number, inner?: number) => {
    const pts: P[] = [];
    const total = inner ? n * 2 : n;
    for (let i = 0; i < total; i++) {
      const a = start + (i * 2 * Math.PI) / total;
      const f = inner && i % 2 ? inner : 1;
      pts.push({ x: cx + rx * f * Math.cos(a), y: cy + ry * f * Math.sin(a) });
    }
    return poly(pts);
  };
  switch (kind) {
    case "retangulo":
      return {
        nodes: poly([
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]),
        closed: true,
      };
    case "arredondado": {
      const rr = Math.min(w, h) * 0.15;
      const k = rr * K;
      const n = (px: number, py: number, hIn?: P, hOut?: P): CmNode => ({
        x: px,
        y: py,
        smooth: false,
        ...(hIn ? { hIn } : {}),
        ...(hOut ? { hOut } : {}),
      });
      return {
        closed: true,
        nodes: [
          n(x + rr, y, { x: -k, y: 0 }),
          n(x + w - rr, y, undefined, { x: k, y: 0 }),
          n(x + w, y + rr, { x: 0, y: -k }),
          n(x + w, y + h - rr, undefined, { x: 0, y: k }),
          n(x + w - rr, y + h, { x: k, y: 0 }),
          n(x + rr, y + h, undefined, { x: -k, y: 0 }),
          n(x, y + h - rr, { x: 0, y: k }),
          n(x, y + rr, undefined, { x: 0, y: -k }),
        ],
      };
    }
    case "elipse":
      return {
        closed: true,
        nodes: [
          { x: cx + rx, y: cy, smooth: true, hIn: { x: 0, y: -ry * K }, hOut: { x: 0, y: ry * K } },
          { x: cx, y: cy + ry, smooth: true, hIn: { x: rx * K, y: 0 }, hOut: { x: -rx * K, y: 0 } },
          { x: cx - rx, y: cy, smooth: true, hIn: { x: 0, y: ry * K }, hOut: { x: 0, y: -ry * K } },
          { x: cx, y: cy - ry, smooth: true, hIn: { x: -rx * K, y: 0 }, hOut: { x: rx * K, y: 0 } },
        ],
      };
    case "triangulo":
      return {
        nodes: poly([
          { x: cx, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]),
        closed: true,
      };
    case "losango":
      return {
        nodes: poly([
          { x: cx, y },
          { x: x + w, y: cy },
          { x: cx, y: y + h },
          { x, y: cy },
        ]),
        closed: true,
      };
    case "pentagono":
      return { nodes: regular(5, -Math.PI / 2), closed: true };
    case "hexagono":
      return { nodes: regular(6, 0), closed: true };
    case "estrela":
      return { nodes: regular(5, -Math.PI / 2, 0.4), closed: true };
    case "seta": {
      const p = (u: number, v: number) => ({ x: x + u * w, y: y + v * h });
      return {
        nodes: poly([
          p(0, 0.3),
          p(0.6, 0.3),
          p(0.6, 0),
          p(1, 0.5),
          p(0.6, 1),
          p(0.6, 0.7),
          p(0, 0.7),
        ]),
        closed: true,
      };
    }
    case "linha":
      return { nodes: poly([r.a, r.b]), closed: false };
  }
}
