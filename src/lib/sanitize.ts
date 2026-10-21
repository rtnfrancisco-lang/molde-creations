/* Validação e sanitização dos dados do projeto (arquivo e armazenamento). Funções puras, sem DOM. */

export type Res<T> = { value: T; issues: string[] };
export type Pt = { x: number; y: number };
export type SNode = { x: number; y: number; smooth: boolean; hIn?: Pt; hOut?: Pt };
export const VIEWS = ["frente", "costas", "mangaEsq", "mangaDir"] as const;
export type SView = (typeof VIEWS)[number];
type ByView<T> = Record<SView, T>;

/* ---------- Helpers ---------- */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Número finito limitado ao intervalo; senão o padrão. */
export function num(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  if (!isNum(v)) return def;
  return Math.min(max, Math.max(min, v));
}
export const str = (v: unknown, max = 1000): string => (typeof v === "string" ? v.slice(0, max) : "");
export const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : def;
export const bool = (v: unknown): boolean => v === true;

const NAMED = new Set([
  "black", "white", "red", "green", "blue", "yellow", "cyan", "magenta", "gray", "grey", "orange", "purple",
  "pink", "brown", "navy", "teal", "lime", "maroon", "olive", "silver", "aqua", "fuchsia", "gold", "transparent", "none",
]);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN = /^(?:rgba?|hsla?)\(\s*[-+0-9.%\s,/]+\)$/i;
/** Cor segura (sem ";", url(), etc.). */
export function cor(v: unknown, def: string | null = null): string | null {
  if (typeof v !== "string") return def;
  const s = v.trim();
  if (s.length > 64) return def;
  if (HEX.test(s) || FN.test(s) || NAMED.has(s.toLowerCase())) return s;
  return def;
}
const isCor = (v: unknown) => cor(v) !== null;

export const MAX_IMAGE_CHARS = 120 * 1024 * 1024;
const DATA_IMG = /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;charset=[\w-]+)?(?:;base64)?,/i;
/** Só data URL de imagem, sem aspas nem < >. */
export function safeImageSrc(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_IMAGE_CHARS) return null;
  const m = DATA_IMG.exec(v);
  if (!m) return null;
  const body = v.slice(m[0].length);
  if (/["'<>\s]/.test(body)) return null;
  return v;
}

/** Resume problemas: "3 itens inválidos foram descartados ou corrigidos: 1 camada sem imagem, 2 coordenadas inválidas". */
export function summarizeIssues(issues: string[]): string {
  if (!issues.length) return "";
  const c = new Map<string, number>();
  for (const i of issues) c.set(i, (c.get(i) ?? 0) + 1);
  const parts = [...c].map(([k, n]) => `${n} ${k}`);
  const shown = parts.slice(0, 6).join(", ") + (parts.length > 6 ? "…" : "");
  const n = issues.length;
  return `${n} ${n === 1 ? "item inválido foi descartado ou corrigido" : "itens inválidos foram descartados ou corrigidos"}: ${shown}`;
}

/* Lê número; registra problema quando presente mas inválido/fora do intervalo. */
function numI(v: unknown, def: number, min: number, max: number, issues: string[], label = "coordenadas inválidas") {
  if (isNum(v) && v >= min && v <= max) return v;
  issues.push(label);
  return num(v, def, min, max);
}

/* ---------- Nós ---------- */
export const MAX_NODES = 5000;
function pt(v: unknown): Pt | undefined {
  if (!isObj(v) || !isNum(v["x"]) || !isNum(v["y"])) return undefined;
  return { x: num(v["x"], 0, -10, 10), y: num(v["y"], 0, -10, 10) };
}
export function sanitizeNodes(raw: unknown, issues: string[]): SNode[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_NODES) issues.push("listas com nós demais (cortadas)");
  const out: SNode[] = [];
  for (const n of raw.slice(0, MAX_NODES)) {
    if (!isObj(n) || !isNum(n["x"]) || !isNum(n["y"])) {
      issues.push("nós inválidos");
      continue;
    }
    const node: SNode = {
      x: numI(n["x"], 0, -10, 10, issues),
      y: numI(n["y"], 0, -10, 10, issues),
      smooth: bool(n["smooth"]),
    };
    const hIn = pt(n["hIn"]);
    const hOut = pt(n["hOut"]);
    if (hIn) node.hIn = hIn;
    if (hOut) node.hOut = hOut;
    out.push(node);
  }
  return out;
}

export function sanitizeShapes(raw: unknown, defaults: ByView<SNode[]>): Res<ByView<SNode[]>> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  const value = {} as ByView<SNode[]>;
  for (const v of VIEWS) {
    if (o[v] === undefined) {
      value[v] = defaults[v];
      continue;
    }
    const n = sanitizeNodes(o[v], issues);
    if (!n || n.length < 2) {
      issues.push("formas de molde inválidas");
      value[v] = defaults[v];
    } else value[v] = n;
  }
  return { value, issues };
}

/* ---------- Camadas ---------- */
export type SPath = { subs: { nodes: SNode[]; closed: boolean }[]; fill: string | null; stroke: string | null; sw: number; rule: "nonzero" | "evenodd" };
export type SInit = { cx: number; cy: number; w: number; ratio: number; rot: number };
export type SSlot = { kind: "nome" | "numero"; h: "esquerda" | "centro" | "direita"; v: "topo" | "centro" | "base"; scale: boolean };
export type SLayer = {
  id: string; name: string; kind: "imagem" | "vetor" | "pdf"; src?: string; paths?: SPath[];
  cx: number; cy: number; w: number; ratio: number; rot: number;
  hidden?: boolean; clipped?: boolean; init?: SInit; slot?: SSlot;
};
const MAX_LAYERS = 500;
const MAX_PATHS = 2000;

function sanitizeInit(v: unknown): SInit | undefined {
  if (!isObj(v)) return undefined;
  return {
    cx: num(v["cx"], 0.5, -20, 20), cy: num(v["cy"], 0.5, -20, 20), w: num(v["w"], 0.3, 0.001, 20),
    ratio: num(v["ratio"], 1, 0.001, 1000), rot: num(v["rot"], 0, -3600, 3600),
  };
}
function sanitizeSlot(v: unknown): SSlot | undefined {
  if (!isObj(v)) return undefined;
  if (v["kind"] !== "nome" && v["kind"] !== "numero") return undefined;
  return {
    kind: v["kind"],
    h: oneOf(v["h"], ["esquerda", "centro", "direita"] as const, "centro"),
    v: oneOf(v["v"], ["topo", "centro", "base"] as const, "centro"),
    scale: bool(v["scale"]),
  };
}
function sanitizePaths(raw: unknown, issues: string[]): SPath[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_PATHS) issues.push("listas de caminhos grandes demais (cortadas)");
  const out: SPath[] = [];
  for (const p of raw.slice(0, MAX_PATHS)) {
    if (!isObj(p) || !Array.isArray(p["subs"])) {
      issues.push("caminhos inválidos");
      continue;
    }
    const subs: SPath["subs"] = [];
    for (const s of (p["subs"] as unknown[]).slice(0, MAX_PATHS)) {
      const nodes = isObj(s) ? sanitizeNodes(s["nodes"], issues) : null;
      if (!nodes || !isObj(s)) {
        issues.push("caminhos inválidos");
        continue;
      }
      subs.push({ nodes, closed: bool(s["closed"]) });
    }
    if (p["fill"] != null && !isCor(p["fill"])) issues.push("cores inválidas");
    if (p["stroke"] != null && !isCor(p["stroke"])) issues.push("cores inválidas");
    if (p["rule"] !== undefined && p["rule"] !== "nonzero" && p["rule"] !== "evenodd") issues.push("regras de preenchimento inválidas");
    out.push({
      subs,
      fill: cor(p["fill"]),
      stroke: cor(p["stroke"]),
      sw: num(p["sw"], 0, 0, 5),
      rule: oneOf(p["rule"], ["nonzero", "evenodd"] as const, "nonzero"),
    });
  }
  return out;
}

function sanitizeLayer(l: unknown, issues: string[], ids: Set<string>): SLayer | null {
  if (!isObj(l)) {
    issues.push("camadas inválidas");
    return null;
  }
  const kind = oneOf(l["kind"], ["imagem", "vetor", "pdf"] as const, "vetor");
  if (l["kind"] !== kind) issues.push("camadas com tipo inválido");
  let id = str(l["id"], 64);
  if (!id || ids.has(id)) {
    if (l["id"] !== undefined) issues.push("ids repetidos");
    let k = 1;
    const base = (id || "camada").slice(0, 56);
    while (ids.has(`${base}-${k}`)) k++;
    id = `${base}-${k}`;
  }
  const out: SLayer = {
    id,
    name: str(l["name"], 120),
    kind,
    cx: numI(l["cx"], 0.5, -20, 20, issues),
    cy: numI(l["cy"], 0.5, -20, 20, issues),
    w: numI(l["w"], 0.3, 0.001, 20, issues),
    ratio: numI(l["ratio"], 1, 0.001, 1000, issues),
    rot: l["rot"] === undefined ? 0 : numI(l["rot"], 0, -3600, 3600, issues, "rotações inválidas"),
  };
  if (kind === "vetor") {
    if (l["src"] !== undefined) {
      const s = safeImageSrc(l["src"]);
      if (s) out.src = s;
      else issues.push("imagens inseguras removidas");
    }
    out.paths = sanitizePaths(l["paths"], issues);
    if (!out.src && !out.paths.length && l["paths"] !== undefined && !Array.isArray(l["paths"])) issues.push("caminhos inválidos");
  } else {
    const s = safeImageSrc(l["src"]);
    if (!s) {
      issues.push(kind === "pdf" ? "camadas de PDF sem imagem" : "camadas sem imagem");
      return null;
    }
    out.src = s;
    if (l["paths"] !== undefined) out.paths = sanitizePaths(l["paths"], issues);
  }
  if (l["hidden"] !== undefined) out.hidden = bool(l["hidden"]);
  if (l["clipped"] !== undefined) out.clipped = bool(l["clipped"]);
  const init = sanitizeInit(l["init"]);
  if (init) out.init = init;
  const slot = sanitizeSlot(l["slot"]);
  if (slot) out.slot = slot;
  else if (l["slot"] !== undefined) issues.push("espaços de imagem inválidos");
  ids.add(id);
  return out;
}

export function sanitizeLayers(raw: unknown): Res<ByView<SLayer[]>> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  if (raw !== undefined && raw !== null && !isObj(raw)) issues.push("listas de camadas inválidas");
  const value = {} as ByView<SLayer[]>;
  const ids = new Set<string>();
  for (const v of VIEWS) {
    const arr = o[v];
    if (arr === undefined) {
      value[v] = [];
      continue;
    }
    if (!Array.isArray(arr)) {
      issues.push("listas de camadas inválidas");
      value[v] = [];
      continue;
    }
    if (arr.length > MAX_LAYERS) issues.push("camadas em excesso (cortadas)");
    value[v] = arr.slice(0, MAX_LAYERS).map((l) => sanitizeLayer(l, issues, ids)).filter((l): l is SLayer => !!l);
  }
  return { value, issues };
}

/* ---------- Textos ---------- */
export type SText = {
  id: string; text: string; x: number; y: number; fontFamily: string; fontSize: number;
  bold: boolean; italic: boolean; underline: boolean; align: "left" | "center" | "right"; color: string;
  field?: "nome" | "numero"; upper?: boolean; fitWidth?: number | undefined; scaleWithSize?: boolean;
  fieldAnchor?: "esquerda" | "centro" | "direita";
};
export function sanitizeTexts(raw: unknown, fonts: readonly string[], defFont = "Arial"): Res<ByView<SText[]>> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  if (raw !== undefined && raw !== null && !isObj(raw)) issues.push("listas de textos inválidas");
  const value = {} as ByView<SText[]>;
  const ids = new Set<string>();
  for (const v of VIEWS) {
    const arr = o[v];
    value[v] = [];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      issues.push("listas de textos inválidas");
      continue;
    }
    for (const t of arr.slice(0, MAX_LAYERS)) {
      if (!isObj(t)) {
        issues.push("textos inválidos");
        continue;
      }
      let id = str(t["id"], 64);
      if (!id || ids.has(id)) {
        if (t["id"] !== undefined) issues.push("ids repetidos");
        let k = 1;
        while (ids.has(`texto-${k}`)) k++;
        id = `texto-${k}`;
      }
      ids.add(id);
      if (t["fontFamily"] !== undefined && !fonts.includes(t["fontFamily"] as string)) issues.push("fontes desconhecidas");
      if (t["color"] !== undefined && !isCor(t["color"])) issues.push("cores inválidas");
      const out: SText = {
        id,
        text: str(t["text"], 2000),
        x: numI(t["x"], 0, -1000, 1000, issues),
        y: numI(t["y"], 0, -1000, 1000, issues),
        fontFamily: oneOf(t["fontFamily"], fonts, defFont),
        fontSize: numI(t["fontSize"], 24, 1, 2000, issues, "tamanhos de fonte inválidos"),
        bold: bool(t["bold"]),
        italic: bool(t["italic"]),
        underline: bool(t["underline"]),
        align: oneOf(t["align"], ["left", "center", "right"] as const, "center"),
        color: cor(t["color"], "#000000") as string,
      };
      if (t["field"] === "nome" || t["field"] === "numero") out.field = t["field"];
      if (t["upper"] !== undefined) out.upper = bool(t["upper"]);
      if (isNum(t["fitWidth"])) out.fitWidth = num(t["fitWidth"], 0, 0, 1000);
      if (t["scaleWithSize"] !== undefined) out.scaleWithSize = bool(t["scaleWithSize"]);
      if (t["fieldAnchor"] !== undefined) out.fieldAnchor = oneOf(t["fieldAnchor"], ["esquerda", "centro", "direita"] as const, "centro");
      value[v].push(out);
    }
  }
  return { value, issues };
}

/* ---------- Estampas ---------- */
export type SArt = {
  src: string; cx: number; cy: number; w: number; ratio: number; clipped?: boolean; rot?: number;
  flipX?: boolean; flipY?: boolean; opacity?: number; name?: string; init?: SInit;
  pre?: { cx: number; cy: number; w: number; rot: number } | undefined;
};
export function sanitizeArtworks(raw: unknown): Res<ByView<SArt | null>> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  const value = {} as ByView<SArt | null>;
  for (const v of VIEWS) {
    const a = o[v];
    value[v] = null;
    if (a == null) continue;
    if (!isObj(a)) {
      issues.push("estampas inválidas");
      continue;
    }
    const src = safeImageSrc(a["src"]);
    if (!src) {
      issues.push("estampas sem imagem");
      continue;
    }
    const out: SArt = {
      src,
      cx: numI(a["cx"], 0.5, -20, 20, issues),
      cy: numI(a["cy"], 0.5, -20, 20, issues),
      w: numI(a["w"], 0.5, 0.001, 20, issues),
      ratio: numI(a["ratio"], 1, 0.001, 1000, issues),
    };
    if (a["clipped"] !== undefined) out.clipped = bool(a["clipped"]);
    if (a["rot"] !== undefined) out.rot = numI(a["rot"], 0, -3600, 3600, issues, "rotações inválidas");
    if (a["flipX"] !== undefined) out.flipX = bool(a["flipX"]);
    if (a["flipY"] !== undefined) out.flipY = bool(a["flipY"]);
    if (a["opacity"] !== undefined) out.opacity = numI(a["opacity"], 1, 0, 1, issues, "opacidades inválidas");
    if (a["name"] !== undefined) out.name = str(a["name"], 120);
    const init = sanitizeInit(a["init"]);
    if (init) out.init = init;
    if (isObj(a["pre"])) {
      const p = a["pre"];
      out.pre = { cx: num(p["cx"], 0.5, -20, 20), cy: num(p["cy"], 0.5, -20, 20), w: num(p["w"], 0.5, 0.001, 20), rot: num(p["rot"], 0, -3600, 3600) };
    }
    value[v] = out;
  }
  return { value, issues };
}

/* ---------- Cores do molde ---------- */
export type SStyle = { stroke: string | null; fill: string | null };
export function sanitizeStyles(raw: unknown): Res<ByView<SStyle>> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  const value = {} as ByView<SStyle>;
  for (const v of VIEWS) {
    const s = isObj(o[v]) ? (o[v] as Record<string, unknown>) : {};
    if ((s["stroke"] != null && !isCor(s["stroke"])) || (s["fill"] != null && !isCor(s["fill"]))) issues.push("cores inválidas");
    value[v] = { stroke: cor(s["stroke"]), fill: cor(s["fill"]) };
  }
  return { value, issues };
}

/* ---------- Medidas e perfis ---------- */
export type SGrading = Record<string, Record<string, number>>;
/** Mantém só tamanhos e medidas conhecidos (0..500); o resto vem do padrão. */
export function sanitizeGrading(raw: unknown, defaults: SGrading): Res<SGrading> {
  const issues: string[] = [];
  const o = isObj(raw) ? raw : {};
  const value: SGrading = {};
  for (const size of Object.keys(defaults)) {
    const def = defaults[size]!;
    const row = isObj(o[size]) ? (o[size] as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    for (const f of Object.keys(def)) {
      if (row[f] === undefined) out[f] = def[f]!;
      else out[f] = numI(row[f], def[f]!, 0, 500, issues, "medidas inválidas");
    }
    value[size] = out;
  }
  return { value, issues };
}

export type SProfile = { name: string; tables: Record<string, SGrading> };
/** Perfis: nomes ≤80, só tabelas dos tipos de peça existentes. */
export function sanitizeProfiles(raw: unknown, defaultsByType: Record<string, SGrading>): Res<SProfile[]> {
  const issues: string[] = [];
  if (!Array.isArray(raw)) return { value: [], issues: raw == null ? [] : ["perfis inválidos"] };
  const value: SProfile[] = [];
  const seen = new Set<string>();
  for (const p of raw.slice(0, 200)) {
    const name = isObj(p) ? str(p["name"], 80).trim() : "";
    if (!isObj(p) || !name || seen.has(name.toLowerCase())) {
      issues.push("perfis inválidos");
      continue;
    }
    seen.add(name.toLowerCase());
    const t = isObj(p["tables"]) ? p["tables"] : {};
    const tables: Record<string, SGrading> = {};
    for (const type of Object.keys(defaultsByType)) {
      const r = sanitizeGrading(t[type], defaultsByType[type]!);
      issues.push(...r.issues);
      tables[type] = r.value;
    }
    value.push({ name, tables });
  }
  return { value, issues };
}
