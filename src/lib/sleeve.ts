/* Formato padrão da manga, migração do formato antigo e segurança proporcional. Funções puras. */
import { SAFETY_OFFSET_CM } from "./vector-offset";

export type SNode = { x: number; y: number; smooth: boolean; hIn?: { x: number; y: number }; hOut?: { x: number; y: number } };
type M = { bodyHeight: number; bodyWidth: number; sleeveHeight: number; sleeveWidth: number };

/** Cabeça em S, cantos vivos a 60% da altura, laterais côncavas e barra reta. */
export const sleeveShape = (): SNode[] => [
  { x: 0, y: 0.6, smooth: false },
  { x: 0.13, y: 0.41, smooth: true },
  { x: 0.26, y: 0.19, smooth: true },
  { x: 0.5, y: 0, smooth: true },
  { x: 0.74, y: 0.19, smooth: true },
  { x: 0.87, y: 0.41, smooth: true },
  { x: 1, y: 0.6, smooth: false },
  { x: 0.935, y: 0.82, smooth: true },
  { x: 0.96, y: 1, smooth: false },
  { x: 0.04, y: 1, smooth: false },
  { x: 0.065, y: 0.82, smooth: true },
];

/** Espelho em x com ordem invertida (mantém o sentido do percurso). */
export const mirrorShape = (nodes: SNode[]): SNode[] =>
  nodes
    .map((n) => ({
      x: 1 - n.x,
      y: n.y,
      smooth: n.smooth,
      ...(n.hOut ? { hIn: { x: -n.hOut.x, y: n.hOut.y } } : {}),
      ...(n.hIn ? { hOut: { x: -n.hIn.x, y: n.hIn.y } } : {}),
    }))
    .reverse();

const OLD: [number, number][] = [[0, 0.32], [0.22, 0.1], [0.5, 0], [0.78, 0.1], [1, 0.32], [0.9, 1], [0.1, 1]];

const sameAs = (v: unknown, ref: [number, number][]) =>
  Array.isArray(v) &&
  v.length === ref.length &&
  v.every((n, i) => {
    const o = n as SNode;
    return o && Math.abs(o.x - ref[i]![0]) < 1e-9 && Math.abs(o.y - ref[i]![1]) < 1e-9 && !o.hIn && !o.hOut;
  });

export const isOldSleeve = (v: unknown, dir: boolean) => sameAs(v, dir ? OLD.map(([x, y]) => [1 - x, y]) : OLD);

/** Troca mangas idênticas ao padrão antigo pelo novo; formas editadas ficam. */
export function migrateSleeveShapes<T extends Record<string, unknown>>(shapes: T): T {
  const out: Record<string, unknown> = { ...shapes };
  if (isOldSleeve(out["mangaEsq"], false)) out["mangaEsq"] = sleeveShape();
  if (isOldSleeve(out["mangaDir"], true)) out["mangaDir"] = mirrorShape(sleeveShape());
  return out as T;
}

/** Atualiza sleeveWidth só onde largura E altura ainda são o padrão antigo. */
export function migrateSleeveWidths<G extends Record<string, M>>(table: G, oldT: Record<string, M>, newT: Record<string, M>): G {
  const out: Record<string, M> = {};
  for (const [s, row] of Object.entries(table)) {
    const o = oldT[s];
    const n = newT[s];
    out[s] = o && n && row && row.sleeveWidth === o.sleeveWidth && row.sleeveHeight === o.sleeveHeight ? { ...row, sleeveWidth: n.sleeveWidth } : row;
  }
  return out as G;
}

/** Zona de segurança: reduz proporcionalmente em peças pequenas em vez de sumir/inverter. */
export const safetyOffsetFor = (W: number, H: number) => -Math.min(Math.abs(SAFETY_OFFSET_CM), Math.min(W, H) * 0.15);
