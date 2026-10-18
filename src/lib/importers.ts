/* Importação de arquivos (SVG, PDF, PNG, JPEG) e utilitários de camadas */

export type P = { x: number; y: number };
export type LNode = { x: number; y: number; smooth: boolean; hIn?: P; hOut?: P };
export type LSub = { nodes: LNode[]; closed: boolean };
export type LPath = { subs: LSub[]; fill: string | null; stroke: string | null; sw: number; rule: "nonzero" | "evenodd" };
export type Layer = {
  id: string;
  name: string;
  kind: "imagem" | "vetor" | "pdf";
  src?: string;
  paths?: LPath[];
  cx: number;
  cy: number;
  w: number;
  ratio: number;
  rot: number;
  hidden?: boolean;
};

/** Converte nós normalizados (0..1) em um path SVG com largura w e altura h (x centrado). */
export function buildPath(nodes: LNode[], w: number, h: number, closed = true) {
  const n = nodes.length;
  if (!n) return "";
  const Pt = (q: P) => ({ x: (q.x - 0.5) * w, y: q.y * h });
  const at = (i: number) => nodes[((i % n) + n) % n]!;
  const s = Pt(at(0));
  let d = `M ${s.x} ${s.y}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = at(i);
    const b = at(i + 1);
    const a0 = at(i - 1);
    const b1 = at(i + 2);
    let c1: P | null = null;
    let c2: P | null = null;
    if (a.hOut) c1 = { x: a.x + a.hOut.x, y: a.y + a.hOut.y };
    else if (a.smooth) c1 = { x: a.x + (b.x - a0.x) / 6, y: a.y + (b.y - a0.y) / 6 };
    if (b.hIn) c2 = { x: b.x + b.hIn.x, y: b.y + b.hIn.y };
    else if (b.smooth) c2 = { x: b.x - (b1.x - a.x) / 6, y: b.y - (b1.y - a.y) / 6 };
    const pb = Pt(b);
    if (c1 || c2) {
      const q1 = Pt(c1 ?? a);
      const q2 = Pt(c2 ?? b);
      d += ` C ${q1.x} ${q1.y} ${q2.x} ${q2.y} ${pb.x} ${pb.y}`;
    } else d += ` L ${pb.x} ${pb.y}`;
  }
  return closed ? d + " Z" : d;
}

export const layerPathD = (p: LPath, aw: number, ah: number) =>
  p.subs.map((s) => buildPath(s.nodes, aw, ah, s.closed)).join(" ");

/* ---------- Parser de paths SVG ---------- */
type RP = { x: number; y: number; cin?: P; cout?: P };
type RSub = { pts: RP[]; closed: boolean };
const NS = "http://www.w3.org/2000/svg";

function parseD(d: string, host: SVGSVGElement): RSub[] {
  const tok = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: RSub[] = [];
  let sub: RSub | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lastC: P | null = null;
  let lastQ: P | null = null;
  let i = 0;
  let cmd = "";
  const isCmd = (t: string) => /^[a-zA-Z]$/.test(t);
  const num = () => parseFloat(tok[i++]!);
  const ensure = (): RSub => {
    if (!sub) {
      sub = { pts: [{ x: cx, y: cy }], closed: false };
      subs.push(sub);
    }
    return sub;
  };
  while (i < tok.length) {
    if (isCmd(tok[i]!)) cmd = tok[i++]!;
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    let nc: P | null = null;
    let nq: P | null = null;
    if (C === "Z") {
      if (sub) {
        const s: RSub = sub;
        s.closed = true;
        const f = s.pts[0]!;
        const l = s.pts[s.pts.length - 1]!;
        if (s.pts.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
          if (l.cin) f.cin = l.cin;
          s.pts.pop();
        }
      }
      cx = sx;
      cy = sy;
      sub = null;
      lastC = lastQ = null;
      cmd = "";
      continue;
    }
    if (i >= tok.length || isCmd(tok[i]!)) continue;
    switch (C) {
      case "M":
        cx = ox + num();
        cy = oy + num();
        sx = cx;
        sy = cy;
        sub = { pts: [{ x: cx, y: cy }], closed: false };
        subs.push(sub);
        cmd = rel ? "l" : "L";
        break;
      case "L":
        cx = ox + num();
        cy = oy + num();
        ensure().pts.push({ x: cx, y: cy });
        break;
      case "H":
        cx = ox + num();
        ensure().pts.push({ x: cx, y: cy });
        break;
      case "V":
        cy = oy + num();
        ensure().pts.push({ x: cx, y: cy });
        break;
      case "C":
      case "S":
      case "Q":
      case "T": {
        let c1: P, c2: P, e: P;
        if (C === "C") {
          c1 = { x: ox + num(), y: oy + num() };
          c2 = { x: ox + num(), y: oy + num() };
          e = { x: ox + num(), y: oy + num() };
          nc = c2;
        } else if (C === "S") {
          c1 = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
          c2 = { x: ox + num(), y: oy + num() };
          e = { x: ox + num(), y: oy + num() };
          nc = c2;
        } else {
          const prevQ: P | null = lastQ;
          const q: P = C === "Q" ? { x: ox + num(), y: oy + num() } : prevQ ? { x: 2 * cx - prevQ.x, y: 2 * cy - prevQ.y } : { x: cx, y: cy };
          e = { x: ox + num(), y: oy + num() };
          c1 = { x: cx + (2 / 3) * (q.x - cx), y: cy + (2 / 3) * (q.y - cy) };
          c2 = { x: e.x + (2 / 3) * (q.x - e.x), y: e.y + (2 / 3) * (q.y - e.y) };
          nq = q;
        }
        const s = ensure();
        s.pts[s.pts.length - 1]!.cout = c1;
        s.pts.push({ x: e.x, y: e.y, cin: c2 });
        cx = e.x;
        cy = e.y;
        break;
      }
      case "A": {
        const a = [num(), num(), num(), num(), num()];
        const e = { x: ox + num(), y: oy + num() };
        const pe = document.createElementNS(NS, "path");
        pe.setAttribute("d", `M${cx} ${cy}A${a.join(" ")} ${e.x} ${e.y}`);
        host.appendChild(pe);
        const L = pe.getTotalLength();
        const s = ensure();
        for (let k = 1; k < 12; k++) {
          const q = pe.getPointAtLength((L * k) / 12);
          s.pts.push({ x: q.x, y: q.y });
        }
        s.pts.push({ x: e.x, y: e.y });
        pe.remove();
        cx = e.x;
        cy = e.y;
        break;
      }
      default:
        i++;
    }
    lastC = nc;
    lastQ = nq;
  }
  return subs.filter((s) => s.pts.length > 1);
}

const num = (el: Element, a: string) => parseFloat(el.getAttribute(a) ?? "0") || 0;

function toD(el: Element): string {
  switch (el.tagName.toLowerCase()) {
    case "path":
      return el.getAttribute("d") ?? "";
    case "rect": {
      const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height");
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
    case "circle":
    case "ellipse": {
      const cx = num(el, "cx"), cy = num(el, "cy");
      const rx = el.tagName.toLowerCase() === "circle" ? num(el, "r") : num(el, "rx");
      const ry = el.tagName.toLowerCase() === "circle" ? num(el, "r") : num(el, "ry");
      const k = 0.5523;
      return `M${cx + rx} ${cy}C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry}C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy}C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry}C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy}Z`;
    }
    case "line":
      return `M${num(el, "x1")} ${num(el, "y1")}L${num(el, "x2")} ${num(el, "y2")}`;
    case "polyline":
    case "polygon": {
      const v = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      let d = "";
      for (let i = 0; i + 1 < v.length; i += 2) d += (i ? "L" : "M") + v[i] + " " + v[i + 1];
      return el.tagName.toLowerCase() === "polygon" ? d + "Z" : d;
    }
  }
  return "";
}

const color = (c: string) => {
  if (!c || c === "none" || c === "transparent" || c === "rgba(0, 0, 0, 0)") return null;
  if (c.startsWith("url")) return "#9ca3af";
  return c;
};

/** Lê um SVG e devolve os caminhos como nós editáveis. Retorna null se não houver vetores. */
export function importSvg(text: string): { paths: LPath[]; ratio: number } | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return null;
  const hostDiv = document.createElement("div");
  hostDiv.style.cssText = "position:fixed;left:-99999px;top:0;width:1000px;height:1000px;visibility:hidden;pointer-events:none";
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  hostDiv.appendChild(svg);
  document.body.appendChild(hostDiv);
  try {
    type Raw = { subs: RSub[]; fill: string | null; stroke: string | null; sw: number; rule: "nonzero" | "evenodd" };
    const raws: Raw[] = [];
    svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon").forEach((el) => {
      if (el.closest("defs,clipPath,mask,symbol,pattern,marker")) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const subs = parseD(toD(el), svg);
      if (!subs.length) return;
      const m = (el as SVGGraphicsElement).getCTM();
      if (m) {
        const tf = (p: P) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
        subs.forEach((s) =>
          s.pts.forEach((p) => {
            const q = tf(p);
            if (p.cin) p.cin = tf(p.cin);
            if (p.cout) p.cout = tf(p.cout);
            p.x = q.x;
            p.y = q.y;
          }),
        );
      }
      const scale = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1;
      raws.push({
        subs,
        fill: color(cs.fill),
        stroke: color(cs.stroke),
        sw: (parseFloat(cs.strokeWidth) || 0) * scale,
        rule: cs.fillRule === "evenodd" ? "evenodd" : "nonzero",
      });
    });
    if (!raws.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    raws.forEach((r) =>
      r.subs.forEach((s) =>
        s.pts.forEach((p) => {
          x0 = Math.min(x0, p.x);
          y0 = Math.min(y0, p.y);
          x1 = Math.max(x1, p.x);
          y1 = Math.max(y1, p.y);
        }),
      ),
    );
    const bw = Math.max(x1 - x0, 1e-6);
    const bh = Math.max(y1 - y0, bw * 0.01);
    const paths: LPath[] = raws.map((r) => ({
      fill: r.fill,
      stroke: r.stroke,
      sw: r.sw / bw,
      rule: r.rule,
      subs: r.subs.map((s) => ({
        closed: s.closed,
        nodes: s.pts.map((p) => {
          const n: LNode = { x: (p.x - x0) / bw, y: (p.y - y0) / bh, smooth: false };
          if (p.cin) n.hIn = { x: (p.cin.x - p.x) / bw, y: (p.cin.y - p.y) / bh };
          if (p.cout) n.hOut = { x: (p.cout.x - p.x) / bw, y: (p.cout.y - p.y) / bh };
          return n;
        }),
      })),
    }));
    return { paths, ratio: bh / bw };
  } finally {
    hostDiv.remove();
  }
}

/** Renderiza a 1ª página de um PDF como imagem de alta resolução. */
export async function pdfToImage(file: File): Promise<{ src: string; ratio: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 4000 / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
  return { src: canvas.toDataURL("image/png"), ratio: vp.height / vp.width };
}

export const readDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export const imageRatio = (src: string) =>
  new Promise<number>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img.naturalHeight / img.naturalWidth);
    img.onerror = rej;
    img.src = src;
  });

const esc = (s: string) => s.replace(/"/g, "'");
const pathsMarkup = (paths: LPath[], aw: number, ah: number) =>
  paths
    .map(
      (p) =>
        `<path d="${layerPathD(p, aw, ah)}" fill="${esc(p.fill ?? "none")}" stroke="${esc(p.stroke ?? "none")}" stroke-width="${p.sw * aw}" fill-rule="${p.rule}"/>`,
    )
    .join("");

/** SVG autônomo de uma camada vetorial (usado para PowerClip). */
export function vectorDataUrl(l: Layer, pad = 0) {
  const aw = 1000;
  const ah = aw * l.ratio;
  const vw = aw + 2 * pad;
  const vh = ah + 2 * pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${-aw / 2 - pad} ${-pad} ${vw} ${vh}">${pathsMarkup(l.paths ?? [], aw, ah)}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** Marcação SVG de uma camada em cm reais, para exportação. */
export function layerMarkup(l: Layer, W: number, H: number) {
  if (l.hidden) return "";
  const aw = l.w * W;
  const ah = aw * l.ratio;
  const cx = (l.cx - 0.5) * W;
  const cy = l.cy * H;
  const inner = l.src
    ? `<image href="${l.src}" x="${-aw / 2}" y="${-ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="none"/>`
    : `<g transform="translate(0 ${-ah / 2})">${pathsMarkup(l.paths ?? [], aw, ah)}</g>`;
  return `<g transform="translate(${cx} ${cy}) rotate(${l.rot})">${inner}</g>`;
}
