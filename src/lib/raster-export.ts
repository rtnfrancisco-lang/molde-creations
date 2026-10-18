/* Rasterização de SVG para PNG/JPEG/PDF com fontes embutidas (browser only). */

type FontFile = { family: string; weight: 400 | 700; style: "normal" | "italic"; load: () => Promise<{ default: string }> };

const FONT_FILES: FontFile[] = [
  { family: "Montserrat", weight: 400, style: "normal", load: () => import("@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url") },
  { family: "Montserrat", weight: 700, style: "normal", load: () => import("@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url") },
  { family: "Montserrat", weight: 400, style: "italic", load: () => import("@fontsource/montserrat/files/montserrat-latin-400-italic.woff2?url") },
  { family: "Montserrat", weight: 700, style: "italic", load: () => import("@fontsource/montserrat/files/montserrat-latin-700-italic.woff2?url") },
  { family: "Roboto", weight: 400, style: "normal", load: () => import("@fontsource/roboto/files/roboto-latin-400-normal.woff2?url") },
  { family: "Roboto", weight: 700, style: "normal", load: () => import("@fontsource/roboto/files/roboto-latin-700-normal.woff2?url") },
  { family: "Roboto", weight: 400, style: "italic", load: () => import("@fontsource/roboto/files/roboto-latin-400-italic.woff2?url") },
  { family: "Roboto", weight: 700, style: "italic", load: () => import("@fontsource/roboto/files/roboto-latin-700-italic.woff2?url") },
  { family: "Bebas Neue", weight: 400, style: "normal", load: () => import("@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url") },
  { family: "IBM Plex Mono", weight: 400, style: "normal", load: () => import("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url") },
];

const cache = new Map<FontFile, Promise<string>>();
const toDataUrl = (f: FontFile) => {
  let p = cache.get(f);
  if (!p) {
    p = f.load().then(async (m) => {
      const buf = new Uint8Array(await (await fetch(m.default)).arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return `data:font/woff2;base64,${btoa(bin)}`;
    });
    p.catch(() => cache.delete(f));
    cache.set(f, p);
  }
  return p;
};

/** Injeta @font-face (data URL) para as famílias usadas e troca o monospace do rótulo pela IBM Plex Mono. */
export async function embedFonts(svg: string): Promise<string> {
  let out = svg.replace(/font-family="monospace"/g, `font-family="'IBM Plex Mono', monospace"`);
  const used = FONT_FILES.filter((f) => out.includes(f.family));
  if (!used.length) return out;
  const rules = await Promise.all(
    used.map(async (f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};src:url(${await toDataUrl(f)}) format('woff2');}`).map((p) => p.catch(() => "")),
  );
  const style = `<style>${rules.join("")}</style>`;
  out = out.replace(/(<svg[^>]*>)/, `$1${style}`);
  return out;
}

const loadImage = (svg: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

/** SVG → imagem, fundo branco. Libera o canvas ao final. */
export async function rasterize(svg: string, pxW: number, pxH: number, type: "image/png" | "image/jpeg" = "image/png", quality?: number): Promise<Blob> {
  if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;
  const img = await loadImage(await embedFonts(svg));
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), type, quality));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** PDF de uma página exatamente cmW × cmH, sem margem, imagem JPEG cobrindo tudo. */
export async function svgToPdf(svg: string, cmW: number, cmH: number, pxW: number, pxH: number, quality: number, title: string): Promise<Uint8Array> {
  const jpg = await rasterize(svg, pxW, pxH, "image/jpeg", quality);
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("MoldeCore");
  const PT = 28.3465;
  const w = cmW * PT;
  const h = cmH * PT;
  const page = doc.addPage([w, h]);
  const im = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
  page.drawImage(im, { x: 0, y: 0, width: w, height: h });
  return doc.save();
}
