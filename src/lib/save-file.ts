/* Salvar arquivo: download na web, diálogo "Salvar como" nativo no desktop. */
import { defaultPathFor, isDesktop, nativeError, rememberDir, savedToast } from "./platform";

function webDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Web: baixa e devolve null. Desktop: caminho salvo, ou null se cancelado/falhou. */
export async function saveBlob(blob: Blob, nomeSugerido: string): Promise<string | null> {
  if (!isDesktop()) {
    webDownload(blob, nomeSugerido);
    return null;
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dot = nomeSugerido.lastIndexOf(".");
    const ext = dot > 0 ? nomeSugerido.slice(dot + 1).toLowerCase() : "";
    const path = await save({
      defaultPath: await defaultPathFor(nomeSugerido),
      ...(ext ? { filters: [{ name: ext.toUpperCase(), extensions: [ext] }] } : {}),
    });
    if (!path) return null;
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    await rememberDir(path);
    savedToast(path);
    return path;
  } catch (e) {
    nativeError("Não foi possível salvar o arquivo", e);
    return null;
  }
}
