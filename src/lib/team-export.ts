/* Nomes de arquivo da exportação do time — funções puras. */

export const DEFAULT_TEAM_TEMPLATE = "{numero}_{nome}_{tamanho}_{vista}.svg";

/** Sem acentos, espaços viram "_", remove caracteres inválidos. */
export const slugPart = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-.]/g, "");

export function teamFileName(template: string, v: { numero: string; nome: string; tamanho: string; vista: string }): string {
  const map: Record<string, string> = {
    numero: slugPart(v.numero),
    nome: slugPart(v.nome).toUpperCase(),
    tamanho: slugPart(v.tamanho),
    vista: slugPart(v.vista),
  };
  let out = (template.trim() || DEFAULT_TEAM_TEMPLATE).replace(/\{(numero|nome|tamanho|vista)\}/g, (_, k: string) => map[k] ?? "");
  out = slugPart(out).replace(/_{2,}/g, "_").replace(/^[_-]+/, "").replace(/[_-]+(\.|$)/, "$1");
  if (!/\.svg$/i.test(out)) out += ".svg";
  return out === ".svg" ? "arquivo.svg" : out;
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
