/* Helpers para montar SVG em string sem permitir injeção de marcação. Funções puras. */
import { cor, safeImageSrc } from "./sanitize";

/** Número finito como texto (igual ao template padrão), senão "0". */
export const n = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : "0";
/** Número finito com casas fixas, senão 0 com as mesmas casas. */
export const nf = (v: unknown, digits: number): string =>
  (typeof v === "number" && Number.isFinite(v) ? v : 0).toFixed(digits);

/** Escapa & < > " ' para uso em atributos ou texto. */
export const attr = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Só data URL de imagem; senão string vazia. */
export const safeSrc = (src: unknown): string => safeImageSrc(src) ?? "";

/** Só cores válidas; senão "none". */
export const color = (c: unknown): string => cor(c) ?? "none";

/** Enumeração por lista fixa. */
export const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : def;
