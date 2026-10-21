/* Acesso a arquivos locais: File System Access API (Chrome/Edge) com alternativa por download/input. */

type Handle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>;
};
export type FileHandle = Handle;

type Picker = { description: string; accept: Record<string, string[]> };
type W = Window & {
  showSaveFilePicker?: (o: { suggestedName?: string; types?: Picker[] }) => Promise<Handle>;
  showOpenFilePicker?: (o: { types?: Picker[]; multiple?: boolean }) => Promise<Handle[]>;
};

const TYPES: Picker[] = [
  { description: "Projeto MoldeCore", accept: { "application/json": [".moldecore", ".json"] } },
];

export const hasFsAccess = () =>
  typeof window !== "undefined" && typeof (window as W).showSaveFilePicker === "function";

export const isAbort = (e: unknown) => (e as DOMException)?.name === "AbortError";

export async function writeHandle(h: Handle, text: string) {
  const w = await h.createWritable();
  await w.write(new Blob([text], { type: "application/json" }));
  await w.close();
}

/** Abre a janela "Salvar como". Devolve null se a API não existir. Lança AbortError se cancelado. */
export async function pickSaveHandle(suggestedName: string): Promise<Handle | null> {
  const w = window as W;
  if (!w.showSaveFilePicker) return null;
  return w.showSaveFilePicker({
    suggestedName,
    types: [{ description: "Projeto MoldeCore", accept: { "application/json": [".moldecore"] } }],
  });
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Abre um projeto. Devolve null se o usuário cancelar. */
export async function openProjectFile(): Promise<{
  text: string;
  name: string;
  handle: Handle | null;
} | null> {
  const w = window as W;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: TYPES, multiple: false });
      if (!h) return null;
      const f = await h.getFile();
      return { text: await f.text(), name: f.name, handle: h };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".moldecore,.json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then((text) => resolve({ text, name: f.name, handle: null }), reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
