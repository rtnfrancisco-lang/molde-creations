/* Formato de arquivo de projeto MoldeCore (.moldecore) — funções puras, sem acesso a arquivo. */

export const PROJECT_APP = "moldecore";
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = ".moldecore";

/** Estado do desenho salvo no arquivo (mesmos dados das chaves "moldecore.*"). */
export type ProjectData = {
  grading: unknown;
  mother: string;
  clothingType: string;
  shapes: unknown;
  artworks: unknown;
  styles: unknown;
  layers: unknown;
  texts: unknown;
  profiles: unknown;
  activeProfile: string;
  /** Lista do Time (ausente em arquivos antigos). */
  roster?: unknown;
  /** Biblioteca de imagens do time (ausente em arquivos antigos). */
  teamImages?: unknown;
};

export type ProjectFile = {
  app: typeof PROJECT_APP;
  version: number;
  savedAt: string;
  name: string;
  data: ProjectData;
};

export type ParseResult = { ok: true; name: string; data: Partial<ProjectData> } | { ok: false; error: string };

export function buildProjectFile(name: string, data: ProjectData): string {
  const file: ProjectFile = { app: PROJECT_APP, version: PROJECT_VERSION, savedAt: new Date().toISOString(), name, data };
  return JSON.stringify(file);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseProjectFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Arquivo inválido ou corrompido (não é um projeto MoldeCore legível)." };
  }
  if (!isObj(raw) || raw["app"] !== PROJECT_APP) return { ok: false, error: "Este arquivo não é um projeto do MoldeCore." };
  const version = raw["version"];
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1)
    return { ok: false, error: "Versão do arquivo inválida." };
  if (version > PROJECT_VERSION) return { ok: false, error: "Arquivo criado numa versão mais nova do MoldeCore." };
  const data = raw["data"];
  if (!isObj(data)) return { ok: false, error: "Arquivo corrompido: dados do projeto ausentes." };
  return { ok: true, name: typeof raw["name"] === "string" ? raw["name"] : "", data: data as Partial<ProjectData> };
}

/** Nome do projeto a partir do nome do arquivo (sem extensão). */
export const nameFromFile = (fileName: string) => fileName.replace(/\.(moldecore|json)$/i, "") || "Sem título";
