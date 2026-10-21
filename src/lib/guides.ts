/* Distâncias das linhas-guia (sangria/segurança) por vista. Funções puras. */
import {
  BLEED_OFFSET_CM,
  SAFETY_OFFSET_CM,
  TECHNICAL_OFFSET_OPTIONS,
  offsetPathD,
} from "./vector-offset";

export type GuideView = "frente" | "costas" | "mangaEsq" | "mangaDir";
export type Guide = { bleed: number; safety: number };
export type Guides = Record<GuideView, Guide>;

export const GUIDE_VIEWS: GuideView[] = ["frente", "costas", "mangaEsq", "mangaDir"];
export const DEFAULT_GUIDE: Guide = { bleed: BLEED_OFFSET_CM, safety: Math.abs(SAFETY_OFFSET_CM) };
export const DEFAULT_GUIDES: Guides = {
  frente: { ...DEFAULT_GUIDE },
  costas: { ...DEFAULT_GUIDE },
  mangaEsq: { ...DEFAULT_GUIDE },
  mangaDir: { ...DEFAULT_GUIDE },
};
export const BLEED_MAX = 10;
export const SAFETY_MAX = 20;

const ok = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

export function sanitizeGuides(raw: unknown): Guides {
  const out = { ...DEFAULT_GUIDES };
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const v of GUIDE_VIEWS) {
    const g = (o[v] && typeof o[v] === "object" ? o[v] : {}) as Record<string, unknown>;
    out[v] = {
      bleed: ok(g["bleed"], BLEED_MAX) ? (g["bleed"] as number) : DEFAULT_GUIDE.bleed,
      safety: ok(g["safety"], SAFETY_MAX) ? (g["safety"] as number) : DEFAULT_GUIDE.safety,
    };
  }
  return out;
}

/** Aceita vírgula ou ponto. null = vazio, negativo, inválido ou acima do máximo. */
export function parseCm(text: string, max: number): number | null {
  const t = text.trim().replace(",", ".");
  if (!t || !/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
}

/** "1", "1,5" (vírgula decimal). */
export const fmtCm = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export const isDefaultGuide = (g: Guide) =>
  g.bleed === DEFAULT_GUIDE.bleed && g.safety === DEFAULT_GUIDE.safety;

/** Segurança efetiva (cm, positiva). O valor padrão encolhe em peças pequenas; valores do usuário são exatos. */
export const effectiveSafety = (W: number, H: number, cm: number) =>
  cm === DEFAULT_GUIDE.safety ? Math.min(cm, Math.min(W, H) * 0.15) : cm;

/** Traçados técnicos: "" significa "não desenhar". */
export function guidePaths(seam: string, W: number, H: number, g: Guide) {
  const bleed = g.bleed > 0 ? offsetPathD(seam, g.bleed, TECHNICAL_OFFSET_OPTIONS) : "";
  const s = effectiveSafety(W, H, g.safety);
  const safety = s > 0 ? offsetPathD(seam, -s, TECHNICAL_OFFSET_OPTIONS) : "";
  return { bleed, safety, frameSrc: bleed || seam, safetyFailed: s > 0 && !safety };
}
