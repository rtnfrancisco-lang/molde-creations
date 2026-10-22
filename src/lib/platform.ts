/* Detecção da versão desktop (Tauri). Pacotes @tauri-apps/* só por import() dinâmico, dentro de funções desktop. */
import { toast } from "sonner";

export const isDesktop = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

export const errMsg = (e: unknown) =>
  (e instanceof Error ? e.message : typeof e === "string" ? e : "") || "erro desconhecido";

/** Mostra a falha de uma função nativa sem travar o app. */
export const nativeError = (what: string, e: unknown) =>
  toast.error(`${what}: ${errMsg(e)}`, { duration: 8000 });

export async function revealInFolder(path: string) {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch (e) {
    nativeError("Não foi possível abrir a pasta", e);
  }
}

export function savedToast(path: string, msg = `Salvo em ${path}`, duration = 10000) {
  toast.success(msg, {
    duration,
    action: { label: "Mostrar na pasta", onClick: () => void revealInFolder(path) },
  });
}

const LAST_DIR = "moldecore.ultimaPasta";
export const lastDir = (): string | undefined => {
  try {
    return localStorage.getItem(LAST_DIR) || undefined;
  } catch {
    return undefined;
  }
};
export async function rememberDir(filePath: string) {
  try {
    const { dirname } = await import("@tauri-apps/api/path");
    localStorage.setItem(LAST_DIR, await dirname(filePath));
  } catch {
    /* não essencial */
  }
}
export async function defaultPathFor(name: string) {
  const dir = lastDir();
  if (!dir) return name;
  try {
    const { join } = await import("@tauri-apps/api/path");
    return await join(dir, name);
  } catch {
    return name;
  }
}
