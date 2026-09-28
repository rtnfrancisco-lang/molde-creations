/* ============================================================================
   MoldeCore · Offset vetorial real (Curva Paralela / Path Offset)
   ---------------------------------------------------------------------------
   Gera as linhas paralelas à Linha de Costura (linha mestra preta do molde)
   calculando, ponto a ponto, a NORMAL PERPENDICULAR do próprio traçado — em vez
   de escalar a largura e a altura da caixa do molde.

     offsetPathD(d,  1)  ->  1 cm para FORA   (Margem de Sangria / azul)
     offsetPathD(d, -4)  ->  4 cm para DENTRO (Zona de Segurança / vermelho)

   Como o paralelismo é garantido:
   1. O "d" é lido comando por comando (M/L/H/V/C/S/Q/T/Z, absoluto ou relativo)
      e guardado como segmentos exatos: reta continua reta e Bézier continua
      Bézier — o ombro e a barra não viram degraus.
   2. Cada reta é deslocada como reta (a paralela de uma reta é exatamente
      paralela). Cada Bézier é amostrada na própria equação da curva e a normal
      de cada amostra sai da derivada exata em t, então o decote, a cava e as
      laterais mantêm a distância constante, sem facetas nem cruzamentos.
   3. Nos cantos (ombro x decote, bico da cava, quina da barra e da manga) o
      encontro é resolvido pelo canto correto: miter (interseção das duas
      paralelas) nos cantos internos e arco (round, raio igual à distância) nos
      cantos externos — o mesmo comportamento do efeito "Contorno" do
      CorelDRAW. A distância preta/azul/vermelha fica uniforme em todos os
      milímetros do molde.
   4. Laços e voltas que o offset para dentro cria em curvas apertadas são
      cortados nas auto-interseções, evitando linhas cruzadas ou trechos que
      encostam na linha mestra.

   API: offsetPathD(d, distance[, options]).
   ============================================================================ */

type Vec = { x: number; y: number };

export type OffsetOptions = {
  /** Canto externo: "round" (padrão, como o Contorno do CorelDRAW) ou "miter". */
  join?: "round" | "miter";
  /** Limite do miter quando join = "miter" (padrão 4). */
  miterLimit?: number;
  /** Tolerância em cm usada para amostrar as curvas (padrão: até 0,06 cm). */
  tolerance?: number;
};

const EPS = 1e-6;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mag = (v: Vec): number => Math.hypot(v.x, v.y);
const unit = (v: Vec): Vec => {
  const l = mag(v);
  return l > EPS ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
/** Normal perpendicular unitária: gira a tangente 90°. */
const perp = (t: Vec): Vec => ({ x: t.y, y: -t.x });
const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

/** Arredonda para 3 casas (0,001 cm) e evita "-0" no resultado. */
const fmt = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

/* --------------------------- leitura do traçado --------------------------- */

type Tok = { cmd: string; args: number[] };

const tokens = (d: string): Tok[] => {
  const out: Tok[] = [];
  const re = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  let cur: Tok | null = null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      cur = { cmd: m[1], args: [] };
      out.push(cur);
    } else if (cur && m[2] !== undefined) {
      cur.args.push(parseFloat(m[2]));
    }
  }
  return out;
};

type LineSeg = { kind: "L"; a: Vec; b: Vec };
type CubicSeg = { kind: "C"; p0: Vec; c1: Vec; c2: Vec; p3: Vec };
type Seg = LineSeg | CubicSeg;
type Figure = { segs: Seg[]; closed: boolean };

/** Converte o "d" em figuras de segmentos exatos (retas e Bézier cúbicas). */
const parseFigures = (d: string): Figure[] | null => {
  const toks = tokens(d);
  const figs: Figure[] = [];
  let fig: Figure | null = null;
  let pos: Vec = { x: 0, y: 0 };
  let start: Vec = { x: 0, y: 0 };
  let ctrlC: Vec | null = null;
  let ctrlQ: Vec | null = null;

  const ensure = (): Figure => {
    if (!fig) {
      fig = { segs: [], closed: false };
      figs.push(fig);
    }
    return fig;
  };

  const lineTo = (p: Vec) => {
    if (mag(sub(p, pos)) > 1e-5) ensure().segs.push({ kind: "L", a: pos, b: p });
    pos = p;
  };

  const cubicTo = (c1: Vec, c2: Vec, p3: Vec) => {
    const degenerate =
      mag(sub(p3, pos)) < 1e-5 && mag(sub(c1, pos)) < 1e-5 && mag(sub(c2, pos)) < 1e-5;
    if (!degenerate) ensure().segs.push({ kind: "C", p0: pos, c1, c2, p3 });
    pos = p3;
  };

  for (const { cmd, args } of toks) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (i: number): number => (rel ? pos.x + (args[i] ?? 0) : args[i] ?? 0);
    const ay = (i: number): number => (rel ? pos.y + (args[i] ?? 0) : args[i] ?? 0);

    if (C === "Z") {
      if (fig) {
        fig.closed = true;
        const last = fig.segs[fig.segs.length - 1];
        const lastPt = last ? (last.kind === "L" ? last.b : last.p3) : pos;
        if (mag(sub(start, lastPt)) > 1e-4) fig.segs.push({ kind: "L", a: lastPt, b: start });
      }
      pos = { x: start.x, y: start.y };
      ctrlC = null;
      ctrlQ = null;
      fig = null;
      continue;
    }

    if (C === "M") {
      for (let i = 0; i + 2 <= args.length; i += 2) {
        const p = { x: ax(i), y: ay(i + 1) };
        if (i === 0) {
          fig = { segs: [], closed: false };
          figs.push(fig);
          start = { x: p.x, y: p.y };
          pos = { x: p.x, y: p.y };
        } else {
          lineTo(p);
        }
      }
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "L") {
      for (let i = 0; i + 2 <= args.length; i += 2) lineTo({ x: ax(i), y: ay(i + 1) });
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "H") {
      for (let i = 0; i < args.length; i++) lineTo({ x: ax(i), y: pos.y });
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "V") {
      for (let i = 0; i < args.length; i++) lineTo({ x: pos.x, y: ay(i) });
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "C" || C === "S") {
      for (let i = 0; i + 6 <= args.length; i += 6) {
        const c1 =
          C === "C"
            ? { x: ax(i), y: ay(i + 1) }
            : ctrlC
              ? { x: 2 * pos.x - ctrlC.x, y: 2 * pos.y - ctrlC.y }
              : { x: pos.x, y: pos.y };
        const c2 = { x: ax(i + 2), y: ay(i + 3) };
        const p3 = { x: ax(i + 4), y: ay(i + 5) };
        cubicTo(c1, c2, p3);
        ctrlC = { x: c2.x, y: c2.y };
        ctrlQ = null;
      }
      continue;
    }

    if (C === "Q" || C === "T") {
      for (let i = 0; i + 4 <= args.length; i += 4) {
        const q =
          C === "Q"
            ? { x: ax(i), y: ay(i + 1) }
            : ctrlQ
              ? { x: 2 * pos.x - ctrlQ.x, y: 2 * pos.y - ctrlQ.y }
              : { x: pos.x, y: pos.y };
        const p3 = { x: ax(i + 2), y: ay(i + 3) };
        const c1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const c2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        cubicTo(c1, c2, p3);
        ctrlQ = { x: q.x, y: q.y };
        ctrlC = { x: c2.x, y: c2.y };
      }
      continue;
    }

    return null; /* comando não suportado (arcos etc.): quem chamou mantém o traçado original */
  }

  return figs;
};

/* --------------------- amostragem com normais exatas --------------------- */

type Sample = { p: Vec; tIn: Vec; tOut: Vec };
type BuiltFigure = { samples: Sample[]; closed: boolean; area: number };

const cubicAt = (s: CubicSeg, t: number): Vec => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * s.p0.x + b * s.c1.x + c * s.c2.x + e * s.p3.x,
    y: a * s.p0.y + b * s.c1.y + c * s.c2.y + e * s.p3.y,
  };
};

/** Derivada exata da Bézier: é ela que dá a tangente (e a normal) em cada t. */
const cubicTangent = (s: CubicSeg, t: number): Vec => {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (s.c1.x - s.p0.x) + b * (s.c2.x - s.c1.x) + c * (s.p3.x - s.c2.x),
    y: a * (s.c1.y - s.p0.y) + b * (s.c2.y - s.c1.y) + c * (s.p3.y - s.c2.y),
  };
};

/** Subdivide a curva até o desvio da corda cair abaixo da tolerância. */
const sampleCubic = (s: CubicSeg, tol: number, out: { p: Vec; t: Vec }[]): void => {
  const rec = (t0: number, t1: number, depth: number) => {
    const p0 = cubicAt(s, t0);
    const p3 = cubicAt(s, t1);
    const pm = cubicAt(s, (t0 + t1) / 2);
    const chord = sub(p3, p0);
    const dev = mag(chord) > EPS ? Math.abs(cross(sub(pm, p0), unit(chord))) : mag(sub(pm, p0));
    if (depth >= 9 || dev <= tol) {
      const prev = out[out.length - 1];
      const tv = unit(cubicTangent(s, t1));
      const tang = mag(tv) > EPS ? tv : prev ? unit(sub(p3, prev.p)) : { x: 1, y: 0 };
      out.push({ p: p3, t: tang });
      return;
    }
    const tm = (t0 + t1) / 2;
    rec(t0, tm, depth + 1);
    rec(tm, t1, depth + 1);
  };
  rec(0, 1, 0);
};

/** Lista de amostras da figura, com a tangente de entrada e de saída em cada ponto. */
const buildSamples = (fig: Figure, tol: number): BuiltFigure => {
  const samples: Sample[] = [];

  const add = (p: Vec, t: Vec) => {
    const last = samples[samples.length - 1];
    if (last && mag(sub(last.p, p)) <= 1e-5) {
      last.tOut = t;
      last.p = p;
      return;
    }
    samples.push({ p, tIn: t, tOut: t });
  };

  let first = true;
  for (const seg of fig.segs) {
    const pts: { p: Vec; t: Vec }[] = [];
    if (seg.kind === "L") {
      const t = unit(sub(seg.b, seg.a));
      pts.push({ p: seg.a, t }, { p: seg.b, t });
    } else {
      pts.push({ p: seg.p0, t: unit(cubicTangent(seg, 0)) });
      sampleCubic(seg, tol, pts);
    }
    for (const q of pts) {
      if (first) {
        samples.push({ p: q.p, tIn: q.t, tOut: q.t });
        first = false;
      } else {
        add(q.p, q.t);
      }
    }
  }

  let closed = fig.closed;
  if (samples.length > 2) {
    const a = samples[0]!;
    const z = samples[samples.length - 1]!;
    if (mag(sub(a.p, z.p)) <= 1e-4) {
      a.tIn = z.tOut;
      samples.pop();
      closed = true;
    }
  }

  let area = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!.p;
    const q = samples[(i + 1) % samples.length]!.p;
    area += p.x * q.y - q.x * p.y;
  }

  return { samples, closed, area: area / 2 };
};

/* --------------------------- offset / junções --------------------------- */

/** Interseção de duas retas (ponto + direção). */
const lineIntersect = (a: Vec, da: Vec, b: Vec, db: Vec): Vec | null => {
  const den = cross(da, db);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(b, a), db) / den;
  const p = { x: a.x + da.x * t, y: a.y + da.y * t };
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
};

/** Cruzamento próprio de dois segmentos (ignora toques nas pontas/vértices). */
const segCross = (p1: Vec, p2: Vec, p3: Vec, p4: Vec): Vec | null => {
  const r = sub(p2, p1);
  const s = sub(p4, p3);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const qp = sub(p3, p1);
  const t = cross(qp, s) / den;
  const u = cross(qp, r) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { x: p1.x + r.x * t, y: p1.y + r.y * t };
};

/** Constrói a polilinha paralela, resolvendo cada canto (miter x round). */
const offsetPolyline = (
  samples: Sample[],
  k: number,
  join: "round" | "miter",
  miterLimit: number,
): Vec[] => {
  const n = samples.length;
  const K = Math.abs(k);
  const out: Vec[] = [];

  const push = (p: Vec) => {
    const last = out[out.length - 1];
    if (last && mag(sub(last, p)) <= 1e-5) return;
    out.push(p);
  };

  for (let i = 0; i < n; i++) {
    const s = samples[i]!;
    const tIn = unit(s.tIn);
    const tOut = unit(s.tOut);
    const nIn = perp(tIn);
    const nOut = perp(tOut);
    const turn = Math.atan2(cross(tIn, tOut), dot(tIn, tOut));

    /* Trecho liso: o ponto deslocado na normal já é a paralela exata. */
    if (Math.abs(turn) < 1e-4) {
      push({ x: s.p.x + nOut.x * k, y: s.p.y + nOut.y * k });
      continue;
    }

    const pIn = { x: s.p.x + nIn.x * k, y: s.p.y + nIn.y * k };
    const pOut = { x: s.p.x + nOut.x * k, y: s.p.y + nOut.y * k };

    /* Canto voltado para o lado do offset: precisa de arco. Canto do lado
       oposto é interno e fecha na interseção das duas paralelas (miter). */
    const convex = cross(tIn, tOut) * k > 0;
    const hit = lineIntersect(pIn, tIn, pOut, tOut);
    let useMiter = false;
    if (hit) {
      const ml = mag(sub(hit, s.p));
      useMiter = convex ? join === "miter" && ml <= K * miterLimit : ml <= K * 25;
    }

    if (useMiter && hit) {
      push(hit);
      continue;
    }

    const a0 = Math.atan2(nIn.y * k, nIn.x * k);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / 0.1));
    for (let j = 0; j <= steps; j++) {
      const a = a0 + turn * (j / steps);
      push({ x: s.p.x + Math.cos(a) * K, y: s.p.y + Math.sin(a) * K });
    }
  }

  return out;
};

/** Corta laços criados por curva apertada nos offsets para dentro. */
const removeLoops = (input: Vec[], closed: boolean): Vec[] => {
  let out = input;
  if (out.length < 4) return out;

  for (let guard = 0; guard < 32; guard++) {
    const n = out.length;
    if (n < 4) break;
    const segCount = closed ? n : n - 1;
    let cut = false;

    for (let i = 0; i < segCount && !cut; i++) {
      const a = out[i]!;
      const b = out[(i + 1) % n]!;
      for (let j = i + 2; j < segCount; j++) {
        if (closed && i === 0 && j === segCount - 1) continue;
        const c = out[j]!;
        const e = out[(j + 1) % n]!;
        const x = segCross(a, b, c, e);
        if (x) {
          out = out.slice(0, i + 1).concat([x], out.slice(j + 1));
          cut = true;
          break;
        }
      }
    }

    if (!cut) break;
  }

  return out;
};

/**
 * Devolve o "d" do contorno paralelo ao traçado informado.
 * Distância positiva = para fora (sangria); negativa = para dentro (segurança).
 */
export function offsetPathD(d: string, distance: number, options: OffsetOptions = {}): string {
  if (!d || !Number.isFinite(distance) || distance === 0) return d;

  const join = options.join ?? "round";
  const miterLimit = options.miterLimit ?? 4;
  const tol = options.tolerance ?? Math.max(0.02, Math.min(0.06, Math.abs(distance) * 0.05));

  const figures = parseFigures(d);
  if (!figures || figures.length === 0) return d;

  const built: BuiltFigure[] = [];
  for (const f of figures) {
    const b = buildSamples(f, tol);
    if (b.samples.length >= 2) built.push(b);
  }
  if (built.length === 0) return d;

  /* Sentido do desenho define o que é "para fora" nesta peça (o mesmo para o
     contorno principal e para eventuais furos internos, que têm sentido oposto). */
  const main = built.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const outward = main.area >= 0 ? 1 : -1;
  const k = outward * distance;

  const parts: string[] = [];
  for (const b of built) {
    const raw = offsetPolyline(b.samples, k, join, miterLimit);
    const pts = removeLoops(raw, b.closed);
    if (pts.length < 2) continue;
    let s = `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
    for (let i = 1; i < pts.length; i++) s += ` L ${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`;
    if (b.closed) s += " Z";
    parts.push(s);
  }

  return parts.length ? parts.join(" ") : d;
}
