/* ============================================================================
   MoldeCore · Offset vetorial (Contorno Paralelo)
   ---------------------------------------------------------------------------
   Gera contornos paralelos REAIS a partir da Linha de Costura (a linha mestra
   preta do molde): cada segmento e cada curva Bézier é deslocado na
   perpendicular do próprio traçado, como o efeito "Contorno" do CorelDRAW,
   em vez de escalar a largura e a altura do molde inteiro.

   Com isso a sangria (+1 cm, azul) e a zona de segurança (-4 cm, vermelha)
   acompanham exatamente o decote, as cavas, os ombros, as laterais e a barra,
   inclusive a barra das Costas, e continuam acompanhando enquanto o usuário
   move nós e alças na Ferramenta Forma — sem vértices sobrepostos.

   Uso:
     offsetPathD(d,  1)  ->  1 cm para FORA   (Margem de Sangria / azul)
     offsetPathD(d, -4)  ->  4 cm para DENTRO (Zona de Segurança / vermelho)

   A entrada é o mesmo "d" devolvido por buildPath e o sentido "para fora"
   é resolvido automaticamente pelo winding do próprio traçado.
   ============================================================================ */

type Vec = { x: number; y: number };

type Contour = { pts: Vec[]; closed: boolean };

/** Arredonda para 3 casas (0,001 cm) e evita "-0" no resultado. */
const fmt = (v: number): string => String(+v.toFixed(3));

const dist = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y);

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/** Área assinada — define o sentido do traçado. */
const shoelace = (pts: Vec[]): number => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
};

/* --------------------------- leitura do traçado --------------------------- */

type RawCmd = { cmd: string; args: number[] };

const readCommands = (d: string): RawCmd[] => {
  const out: RawCmd[] = [];
  const re = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  let cur: RawCmd | null = null;
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

/** Achata uma cúbica em pontos com passo fino (a curva continua lisa). */
const cubicPts = (p0: Vec, p1: Vec, p2: Vec, p3: Vec, step: number): Vec[] => {
  const len = dist(p0, p1) + dist(p1, p2) + dist(p2, p3) + dist(p3, p0);
  const n = Math.max(3, Math.min(72, Math.ceil(len / Math.max(0.05, step))));
  const out: Vec[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const e = t * t * t;
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
    });
  }
  return out;
};

/** Converte o "d" (M/L/H/V/C/S/Q/T/Z, absoluto ou relativo) em contornos de pontos. */
const flattenPath = (d: string, step: number): Contour[] | null => {
  const cmds = readCommands(d);
  const contours: Contour[] = [];
  let cur: Contour | null = null;
  let pos: Vec = { x: 0, y: 0 };
  let start: Vec = { x: 0, y: 0 };
  let ctrlC: Vec | null = null;
  let ctrlQ: Vec | null = null;

  for (const { cmd, args } of cmds) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (i: number): number => (rel ? pos.x + args[i]! : args[i]!);
    const ay = (i: number): number => (rel ? pos.y + args[i]! : args[i]!);

    if (C === "Z") {
      if (cur) cur.closed = true;
      pos = { x: start.x, y: start.y };
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "M") {
      let first = true;
      for (let i = 0; i + 2 <= args.length; i += 2) {
        const p = { x: ax(i), y: ay(i + 1) };
        if (first) {
          cur = { pts: [p], closed: false };
          contours.push(cur);
          start = { x: p.x, y: p.y };
          first = false;
        } else if (cur) {
          cur.pts.push(p);
        }
        pos = { x: p.x, y: p.y };
      }
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "L") {
      for (let i = 0; i + 2 <= args.length; i += 2) {
        const p = { x: ax(i), y: ay(i + 1) };
        if (cur) cur.pts.push(p);
        pos = { x: p.x, y: p.y };
      }
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "H" || C === "V") {
      for (let i = 0; i < args.length; i++) {
        const p = C === "H" ? { x: ax(i), y: pos.y } : { x: pos.x, y: ay(i) };
        if (cur) cur.pts.push(p);
        pos = { x: p.x, y: p.y };
      }
      ctrlC = null;
      ctrlQ = null;
      continue;
    }

    if (C === "C" || C === "S") {
      for (let i = 0; i + 6 <= args.length; i += 6) {
        const p1 =
          C === "C"
            ? { x: ax(i), y: ay(i + 1) }
            : ctrlC
              ? { x: 2 * pos.x - ctrlC.x, y: 2 * pos.y - ctrlC.y }
              : { x: pos.x, y: pos.y };
        const p2 = C === "C" ? { x: ax(i + 2), y: ay(i + 3) } : { x: ax(i), y: ay(i + 1) };
        const p3 = C === "C" ? { x: ax(i + 4), y: ay(i + 5) } : { x: ax(i + 2), y: ay(i + 3) };
        if (cur) for (const q of cubicPts(pos, p1, p2, p3, step)) cur.pts.push(q);
        ctrlC = { x: p2.x, y: p2.y };
        ctrlQ = null;
        pos = { x: p3.x, y: p3.y };
      }
      continue;
    }

    if (C === "Q" || C === "T") {
      for (let i = 0; i + 4 <= args.length; i += 4) {
        const q = C === "Q" ? { x: ax(i), y: ay(i + 1) } : ctrlQ ? { x: 2 * pos.x - ctrlQ.x, y: 2 * pos.y - ctrlQ.y } : { x: pos.x, y: pos.y };
        const p3 = C === "Q" ? { x: ax(i + 2), y: ay(i + 3) } : { x: ax(i), y: ay(i + 1) };
        const p1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const p2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        if (cur) for (const p of cubicPts(pos, p1, p2, p3, step)) cur.pts.push(p);
        ctrlQ = { x: q.x, y: q.y };
        ctrlC = { x: p2.x, y: p2.y };
        pos = { x: p3.x, y: p3.y };
      }
      continue;
    }

    return null; /* comando não suportado (arco etc.): quem chamou mantém o traçado original */
  }

  return contours;
};

/* ------------------------------ offset paralelo ------------------------------ */

const segIntersect = (a: Vec, b: Vec, c: Vec, e: Vec): boolean => {
  const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross(b.x - a.x, b.y - a.y, e.x - a.x, e.y - a.y);
  const d3 = cross(e.x - c.x, e.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross(e.x - c.x, e.y - c.y, b.x - c.x, b.y - c.y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Desfaz as voltas que um offset para dentro pode criar em cantos fechados. */
const cleanLoops = (pts: Vec[]): Vec[] => {
  if (pts.length < 4) return pts;
  const out: Vec[] = [];
  for (const p of pts) {
    out.push(p);
    let guard = 0;
    while (out.length >= 4 && guard++ < 64) {
      const n = out.length;
      const c = out[n - 2]!;
      const e = out[n - 1]!;
      let hit = -1;
      for (let i = 0; i + 1 <= n - 3; i++) {
        if (segIntersect(out[i]!, out[i + 1]!, c, e)) {
          hit = i;
          break;
        }
      }
      if (hit < 0) break;
      out.splice(hit + 1, n - hit - 3);
    }
  }
  return out.length >= 3 ? out : pts;
};

const offsetContour = (contour: Contour, distance: number, outward: number): Vec[] => {
  const pts = contour.pts;
  const n = pts.length;
  if (n < 2) return pts;
  const segCount = contour.closed ? n : n - 1;
  const dirs: Vec[] = [];
  const offs: Vec[] = [];

  /* Normal de cada segmento, já escalada pela distância: é ela que garante o
     paralelismo real (a distância é medida na perpendicular, não no eixo X/Y). */
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    dirs.push({ x: dx, y: dy });
    offs.push({ x: dy * outward * distance, y: -dx * outward * distance });
  }

  /* Vértice do offset: interseção das duas retas paralelas que chegam e saem.
     Em curva os dois lados praticamente coincidem (paralelismo exato e sem
     picos); em canto fechado o miter é limitado e vira um chanfro curto. */
  const join = (v: Vec, ia: number, ib: number): Vec[] => {
    const da = dirs[ia]!;
    const db = dirs[ib]!;
    const oa = offs[ia]!;
    const ob = offs[ib]!;
    const cr = cross(da.x, da.y, db.x, db.y);
    if (Math.abs(cr) < 1e-7) return [{ x: v.x + oa.x, y: v.y + oa.y }];
    const t = cross(ob.x - oa.x, ob.y - oa.y, db.x, db.y) / cr;
    const p = { x: v.x + oa.x + da.x * t, y: v.y + oa.y + da.y * t };
    if (Math.hypot(p.x - v.x, p.y - v.y) > Math.abs(distance) * 3)
      return [
        { x: v.x + oa.x, y: v.y + oa.y },
        { x: v.x + ob.x, y: v.y + ob.y },
      ];
    return [p];
  };

  const out: Vec[] = [];
  const push = (p: Vec) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-4) return;
    out.push(p);
  };

  if (contour.closed) {
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + segCount) % segCount;
      for (const p of join(pts[i]!, prev, i)) push(p);
    }
    return out.length >= 3 ? cleanLoops(out) : pts;
  }

  push({ x: pts[0]!.x + offs[0]!.x, y: pts[0]!.y + offs[0]!.y });
  for (let i = 1; i < n - 1; i++) for (const p of join(pts[i]!, i - 1, i)) push(p);
  const last = segCount - 1;
  push({ x: pts[n - 1]!.x + offs[last]!.x, y: pts[n - 1]!.y + offs[last]!.y });
  return out;
};

/**
 * Devolve o "d" do contorno paralelo ao traçado informado.
 * Distância positiva = para fora (sangria); negativa = para dentro (segurança).
 */
export function offsetPathD(d: string, distance: number): string {
  if (!d || !Number.isFinite(distance) || distance === 0) return d;
  const step = Math.max(0.1, Math.min(0.5, Math.abs(distance) * 0.25));
  const contours = flattenPath(d, step);
  if (!contours || contours.length === 0) return d;

  /* Sentido do contorno principal: diz o que é "para fora" neste desenho. */
  const main = contours.reduce((a, b) => (Math.abs(shoelace(b.pts)) > Math.abs(shoelace(a.pts)) ? b : a));
  const outward = shoelace(main.pts) >= 0 ? 1 : -1;

  const parts: string[] = [];
  for (const c of contours) {
    const pts = offsetContour(c, distance, outward);
    if (pts.length < 2) continue;
    let s = `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
    for (let i = 1; i < pts.length; i++) s += ` L ${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`;
    if (c.closed) s += " Z";
    parts.push(s);
  }
  return parts.length ? parts.join(" ") : d;
}
