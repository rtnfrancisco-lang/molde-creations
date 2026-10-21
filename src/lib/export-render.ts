/* Renderização compartilhada de arquivos de exportação (PNG/JPEG/PDF) — usada pelo Plotter e pelo Time. */
import { rasterize, svgToPdf } from "./raster-export";
import { cmToPx, fitDpi, type TeamFormat } from "./team-export";

export type ExportFormat = TeamFormat;

/** Gera os bytes de uma peça, reduzindo o DPI quando passa dos limites do navegador. */
export async function renderPiece(
  svg: string,
  cmW: number,
  cmH: number,
  format: ExportFormat,
  dpiWanted: number,
  quality: number,
  title: string,
) {
  const dpi = fitDpi(cmW, cmH, dpiWanted);
  const pxW = cmToPx(cmW, dpi);
  const pxH = cmToPx(cmH, dpi);
  const q = quality / 100;
  const bytes =
    format === "pdf"
      ? await svgToPdf(svg, cmW, cmH, pxW, pxH, q, title)
      : new Uint8Array(
          await (
            await rasterize(
              svg,
              pxW,
              pxH,
              format === "jpeg" ? "image/jpeg" : "image/png",
              format === "jpeg" ? q : undefined,
            )
          ).arrayBuffer(),
        );
  return { bytes, dpi, reduced: dpi < dpiWanted, pxW, pxH };
}

export const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};

export async function zipFiles(files: Record<string, Uint8Array>, format: ExportFormat) {
  const { zipSync } = await import("fflate");
  return zipSync(files, { level: format === "png" ? 0 : 3 });
}

export const todayStamp = (d = new Date()) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
