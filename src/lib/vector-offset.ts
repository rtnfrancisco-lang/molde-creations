/* ============================================================================
   MoldeCore · Offset vetorial real (Path Offset / Contorno Paralelo)
   ---------------------------------------------------------------------------
   Gera as linhas paralelas à Linha de Costura (o traçado mestre preto do molde)
   com geometria vetorial formal — sem escalar a caixa do molde e sem empurrar
   vértice "no olho".

     offsetPathD(d,  1)  ->  1 cm para FORA   (Margem de Sangria   / azul)
     offsetPathD(d, -4)  ->  4 cm para DENTRO (Zona de Segurança   / vermelho)

   1. LEITURA EXATA — o "d" é lido comando por comando (M/L/H/V/C/S/Q/T/A/Z,
      absoluto ou relativo) e vira uma lista de segmentos exatos: reta continua
      reta; Bézier cúbica continua cúbica; quadrática (Q/T) é elevada para cúbica
      e o arco elíptico (A) é convertido em cúbicas equivalentes. Nada é
      achatado em degraus e nenhum comando cai em fallback (era isso que fazia a
      linha colorida desaparecer em cima da preta).

   2. AMOSTRAGEM PELA DERIVADA — cada segmento é subdividido até o desvio da
      corda ficar abaixo da tolerância (padrão: 0,005% da diagonal do molde). A
      tangente em cada ponto sai da DERIVADA EXATA da curva e a normal é essa
      tangente girada 90°. O ponto deslocado fica, portanto, exatamente a |d| de
      distância perpendicular do traçado mestre em toda a volta — decote, ombro,
      cava, barra e manga.

   3. CANTO POR INTERSEÇÃO (esquadria / miter) — em CADA vértice, inclusive nos
      encontros entre segmentos diferentes:
        Offset_Line_A = paralela do segmento que chega  (p + normalA * d)
        Offset_Line_B = paralela do segmento que sai    (p + normalB * d)
        vértice       = interseção exata de Offset_Line_A com Offset_Line_B.
      O ponto de encontro pertence às duas paralelas, logo continua a |d| do
      traçado mestre, e cai na bissetriz do vértice: o bico do ombro, o encontro
      com o decote, a quina da cava e a quina da barra acompanham o nó da linha
      mestra (o quadrado branco), como no efeito Contorno do CorelDRAW.

   4. MITER LIMIT — quando a esquadria passa do limite (ponta aguda demais) ou
      quando as duas paralelas não se cruzam (volta de 180°), o canto fecha com
      chanfro — ou com arco, se join: "round" — mantendo sempre a distância |d|.

   5. LAÇOS — no offset para DENTRO (zona de segurança) curvas apertadas fazem a
      paralela se cruzar; esses laços são cortados na auto-interseção para não
      sobrar trecho atravessando a linha mestre.

   API: offsetPathD(d, distance[, options]).
   ============================================================================ */

type Vec = { x: number; y: number };

export type OffsetOptions = {
  /** Canto em esquadria por interseção exata ("miter", padrão) ou arco ("round"). */
  join?: "round" | "miter";
  /** Limite da esquadria em múltiplos da distância (padrão 4). */
  miterLimit?: number;
  /** Tolerância da subdivisão das curvas, na mesma unidade do "d" (padrão: 0,005% da diagonal do molde). */
  tolerance?: number;
};

const EPS = 1e-12;

/* ------------------------------- vetores ------------------------------- */

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mag = (v: Vec): number => Math.hypot(v.x, v.y);
const unit = (v: Vec): Vec => {
  const l = mag(v);
  return l > EPS ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
/** Normal perpendicular unitária (giro de 90°): é ela que define "para fora". */
const perp = (t: Vec): Vec => ({ x: t.y, y: -t.x });
const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

/** Arredonda para 3 casas e evita "-0" no resultado. */
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

/**
 * Arco elíptico (A) -> cúbicas equivalentes, pela parametrização de centro da
 * própria especificação do SVG. Assim a curva do molde nunca precisa ser
 * aproximada por retas nem cair em fallback.
 */
const arcToSegs = (
  p0: Vec,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p1: Vec,
): Seg[] => {
  if (mag(sub(p1, p0)) < 1e-9) return [];

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9) return [{ kind: "L", a: p0, b: p1 }];

  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const sign = largeArc === sweep ? -1 : 1;
  const co = sign * Math.sqrt(Math.max(0, den !== 0 ? num / den : 0));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dd = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (dd < EPS) return 0;
    const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / dd));
    return Math.sign(ux * vy - uy * vx || 1) * Math.acos(c);
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta0 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / count;
  const kc = (4 / 3) * Math.tan(step / 4);

  const pointAt = (t: number): Vec => ({
    x: cx + rx * cosPhi * Math.cos(t) - ry * sinPhi * Math.sin(t),
    y: cy + rx * sinPhi * Math.cos(t) + ry * cosPhi * Math.sin(t),
  });
  const tangentAt = (t: number): Vec => ({
    x: -rx * cosPhi * Math.sin(t) - ry * sinPhi * Math.cos(t),
    y: -rx * sinPhi * Math.sin(t) + ry * cosPhi * Math.cos(t),
  });

  const segs: Seg[] = [];
  let t = theta0;
  let cur = p0;
  for (let i = 0; i < count; i++) {
    const tNext = t + step;
    const d0 = tangentAt(t);
    const d1 = tangentAt(tNext);
    const end = pointAt(tNext);
    segs.push({
      kind: "C",
      p0: cur,
      c1: { x: cur.x + kc * d0.x, y: cur.y + kc * d0.y },
      c2: { x: end.x - kc * d1.x, y: end.y - kc * d1.y },
      p3: end,
    });
    cur = end;
    t = tNext;
  }
  return segs;
};

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
    if (mag(sub(p, pos)) > 1e-9) ensure().segs.push({ kind: "L", a: pos, b: p });
    pos = p;
  };

  const cubicTo = (c1: Vec, c2: Vec, p3: Vec) => {
    const degenerate =
      mag(sub(p3, pos)) < 1e-9 && mag(sub(c1, pos)) < 1e-9 && mag(sub(c2, pos)) < 1e-9;
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
        if (mag(sub(start, lastPt)) > 1e-6) fig.segs.push({ kind: "L", a: lastPt, b: start });
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
        const q: { x: number; y: number } =
          C === "Q"
            ? { x: ax(i), y: ay(i + 1) }
            : ctrlQ
              ? { x: 2 * pos.x - ctrlQ.x, y: 2 * pos.y - ctrlQ.y }
              : { x: pos.x, y: pos.y };
        const p3 = { x: ax(i + 2), y: ay(i + 3) };
        /* Elevação exata de quadrática para cúbica. */
        const c1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const c2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        cubicTo(c1, c2, p3);
        ctrlQ = { x: q.x, y: q.y };
        ctrlC = { x: c2.x, y: c2.y };
      }
      continue;
    }

    if (C === "A") {
      for (let i = 0; i + 7 <= args.length; i += 7) {
        const p1 = { x: ax(i + 5), y: ay(i + 6) };
        for (const s of arcToSegs(pos, args[i] ?? 0, args[i + 1] ?? 0, args[i + 2] ?? 0, (args[i + 3] ?? 0) !== 0, (args[i + 4] ?? 0) !== 0, p1)) {
          ensure().segs.push(s);
        }
        pos = p1;
      }
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    /* Comando desconhecido: quem chamou mantém o traçado original. */
    return null;
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
    if (depth >= 10 || dev <= tol) {
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
    if (last && mag(sub(last.p, p)) <= 1e-9) {
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
    if (mag(sub(a.p, z.p)) <= 1e-6) {
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

/** Interseção exata de duas retas (ponto + direção). */
const lineIntersect = (a: Vec, da: Vec, b: Vec, db: Vec): Vec | null => {
  const den = cross(da, db);
  if (Math.abs(den) < 1e-12) return null;
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

/**
 * Constrói a polilinha paralela resolvendo CADA canto por INTERSEÇÃO EXATA
 * (esquadria / miter), como no efeito Contorno do CorelDRAW:
 *
 *   paralela da aresta anterior ->  p + nIn  * k
 *   paralela da aresta seguinte ->  p + nOut * k
 *   canto                       ->  interseção das duas retas (lineIntersect)
 *
 * O ponto de encontro pertence às duas paralelas, logo está exatamente a |k| de
 * distância perpendicular da linha mestra — no bico do ombro, no encontro com o
 * decote, na quina da cava, da barra e da manga. Nada de empurrar vértice nem de
 * deformar a quina.
 *
 * Miter limit: só quando a esquadria passa do limite (ponta aguda demais) ou
 * quando as paralelas não se cruzam (volta de 180°) o canto fecha com chanfro
 * (ou com arco de raio |k|), sempre preservando a distância perpendicular.
 */
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
    if (last && mag(sub(last, p)) <= 1e-9) return;
    out.push(p);
  };

  for (let i = 0; i < n; i++) {
    const s = samples[i]!;
    const tIn = unit(s.tIn);
    const tOut = unit(s.tOut);
    const turned = Math.abs(cross(tIn, tOut)) > 1e-9 || dot(tIn, tOut) < 0;

    const shift = (t: Vec): Vec => {
      const nn = perp(t);
      return { x: s.p.x + nn.x * k, y: s.p.y + nn.y * k };
    };

    /* Trecho reto (ou curva tão densa que a tangente praticamente não mudou):
       o próprio ponto deslocado na normal já é a paralela exata. */
    if (!turned) {
      push(shift(tOut));
      continue;
    }

    const pIn = shift(tIn);
    const pOut = shift(tOut);

    /* 1) Esquadria: interseção matemática das duas paralelas. */
    const hit = lineIntersect(pIn, tIn, pOut, tOut);
    if (hit && mag(sub(hit, s.p)) <= Math.max(miterLimit * K, K * 1.0001)) {
      push(hit);
      continue;
    }

    /* 2) Esquadria fora do limite, ou paralelas sem cruzamento (volta de 180°):
       fecha o canto com arco de raio |k| ou com chanfro, mantendo a distância. */
    if (join === "round") {
      const a0 = Math.atan2(pIn.y - s.p.y, pIn.x - s.p.x);
      const turn = Math.atan2(cross(tIn, tOut), dot(tIn, tOut));
      const steps = Math.max(2, Math.ceil(Math.abs(turn) / 0.1));
      for (let j = 0; j <= steps; j++) {
        const a = a0 + turn * (j / steps);
        push({ x: s.p.x + Math.cos(a) * K, y: s.p.y + Math.sin(a) * K });
      }
    } else {
      push(pIn);
      push(pOut);
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

/** Caixa dos pontos de controle: serve só para estimar a tolerância da amostragem. */
const sizeOf = (figures: Figure[]): number => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (p: Vec) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const f of figures) {
    for (const s of f.segs) {
      if (s.kind === "L") {
        see(s.a);
        see(s.b);
      } else {
        see(s.p0);
        see(s.c1);
        see(s.c2);
        see(s.p3);
      }
    }
  }
  if (!Number.isFinite(minX)) return 1;
  return Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
};

/**
 * Devolve o "d" do contorno paralelo ao traçado informado.
 * Distância positiva = para fora (sangria); negativa = para dentro (segurança).
 */
export function offsetPathD(d: string, distance: number, options: OffsetOptions = {}): string {
  if (!d || !Number.isFinite(distance) || distance === 0) return d;

  const join = options.join ?? "miter";
  const miterLimit = options.miterLimit ?? 4;

  const figures = parseFigures(d);
  if (!figures || figures.length === 0) return d;

  /* Tolerância relativa ao tamanho do molde: vale igual se o traçado estiver em
     centímetros, milímetros ou pixels de tela. */
  const tol = options.tolerance ?? Math.max(sizeOf(figures) * 5e-5, 1e-9);

  const built: BuiltFigure[] = [];
  for (const f of figures) {
    const b = buildSamples(f, tol);
    if (b.samples.length >= 2) built.push(b);
  }
  if (built.length === 0) return d;

  /* Sentido do desenho define o que é "para fora" nesta peça. O contorno
     principal manda: eventuais furos internos (sentido oposto) acompanham. */
  const main = built.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const outward = main.area >= 0 ? 1 : -1;
  const k = outward * distance;

  const parts: string[] = [];
  for (const b of built) {
    const raw = offsetPolyline(b.samples, k, join, miterLimit);
    /* Laço só nasce no offset para DENTRO (curvatura mais apertada que a
       distância). No contorno externo da sangria o traçado sai intacto, para
       não cortar as quinas resolvidas por interseção. */
    const pts = distance < 0 ? removeLoops(raw, b.closed) : raw;
    if (pts.length < 2) continue;
    let s = `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
    for (let i = 1; i < pts.length; i++) s += ` L ${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`;
    if (b.closed) s += " Z";
    parts.push(s);
  }

  return parts.length ? parts.join(" ") : d;
}
