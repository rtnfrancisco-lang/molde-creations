/* Nomes de arquivo e limites da exportação do time — funções puras. */

export type TeamFormat = "png" | "jpeg" | "pdf";
export const TEAM_EXT: Record<TeamFormat, string> = { png: "png", jpeg: "jpg", pdf: "pdf" };
export const DEFAULT_TEAM_TEMPLATE = "{numero}_{nome}_{tamanho}_{vista}.{ext}";
export const TEAM_DPIS = [72, 100, 150, 300] as const;
export const MAX_SIDE_PX = 16384;
export const MAX_PIXELS = 100_000_000;

/** Sem acentos, espaços viram "_", remove caracteres inválidos. */
export const slugPart = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-.]/g, "");

export function teamFileName(template: string, v: { numero: string; nome: string; tamanho: string; vista: string }, ext = "svg"): string {
  const map: Record<string, string> = {
    numero: slugPart(v.numero),
    nome: slugPart(v.nome).toUpperCase(),
    tamanho: slugPart(v.tamanho),
    vista: slugPart(v.vista),
    ext,
  };
  let out = (template.trim() || DEFAULT_TEAM_TEMPLATE).replace(/\{(numero|nome|tamanho|vista|ext)\}/g, (_, k: string) => map[k] ?? "");
  out = out.replace(/\.(svg|png|jpe?g|pdf)$/i, "");
  out = slugPart(out).replace(/_{2,}/g, "_").replace(/^[_-]+/, "").replace(/[_\-.]+$/, "");
  return (out || "arquivo") + "." + ext;
}

/** Evita nomes repetidos acrescentando -2, -3… antes da extensão. */
export function uniqueName(name: string, used: Set<string>): string {
  let n = name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base}-${i}${ext}`;
  used.add(n.toLowerCase());
  return n;
}

export const cmToPx = (cm: number, dpi: number) => Math.max(1, Math.round((cm / 2.54) * dpi));

/** DPI efetivo para a peça caber nos limites do canvas do navegador. */
export function fitDpi(cmW: number, cmH: number, dpi: number): number {
  const side = Math.max(cmW, cmH) / 2.54;
  const area = (cmW / 2.54) * (cmH / 2.54);
  const max = Math.min(MAX_SIDE_PX / side, Math.sqrt(MAX_PIXELS / area));
  return dpi <= max ? dpi : Math.floor(max);
}
