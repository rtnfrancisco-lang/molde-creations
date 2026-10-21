/* Biblioteca de imagens do time (nome/número) — vínculo puro + recorte de margens (navegador). */
import type { Player } from "@/lib/roster";

export type TeamImage = { id: string; nome: string; src: string; w: number; h: number };

export const newImageId = () =>
  "img" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Minúsculas, sem acentos, só letras e números. */
export const normKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const baseName = (file: string) => file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");

/** Chave de número: remove prefixo opcional (n, num, numero, camisa). */
export const numberKey = (name: string) => {
  const k = normKey(name);
  const m = /^(?:numero|num|camisa|n)?(\d+)$/.exec(k);
  return m ? m[1]!.replace(/^0+(?=\d)/, "") : null;
};
const playerNum = (n: string) => normKey(n).replace(/^0+(?=\d)/, "");

export type LinkReport = {
  nomes: number;
  numeros: number;
  faltaNome: string[];
  faltaNumero: string[];
  semUso: string[];
};

/** Vincula imagens aos jogadores pelo nome do arquivo. Prefere número quando o arquivo é só dígitos. */
export function autoLink(
  roster: Player[],
  images: TeamImage[],
): { roster: Player[]; used: Set<string> } {
  const used = new Set<string>();
  const next = roster.map((p) => ({ ...p }));
  for (const img of images) {
    const nk = numberKey(img.nome);
    const onlyDigits = /^\d+$/.test(normKey(img.nome));
    const nameK = normKey(img.nome);
    const byNum =
      nk != null ? next.filter((p) => p.numero.trim() && playerNum(p.numero) === nk) : [];
    const byName = nameK ? next.filter((p) => normKey(p.nome) === nameK) : [];
    if (byNum.length && (onlyDigits || !byName.length)) {
      byNum.forEach((p) => (p.imgNumero = img.id));
      used.add(img.id);
    } else if (byName.length) {
      byName.forEach((p) => (p.imgNome = img.id));
      used.add(img.id);
    }
  }
  return { roster: next, used };
}

export function linkReport(roster: Player[], imported: TeamImage[], used: Set<string>): LinkReport {
  return {
    nomes: roster.filter((p) => p.imgNome).length,
    numeros: roster.filter((p) => p.imgNumero).length,
    faltaNome: roster
      .filter((p) => !p.imgNome && p.nome.trim())
      .map((p) => p.nome.trim().toUpperCase()),
    faltaNumero: roster.filter((p) => !p.imgNumero && p.numero.trim()).map((p) => p.numero.trim()),
    semUso: imported.filter((i) => !used.has(i.id)).map((i) => i.nome),
  };
}

export function reportText(r: LinkReport) {
  const falta = [
    ...r.faltaNome.map((n) => `${n} (nome)`),
    ...r.faltaNumero.map((n) => `${n} (número)`),
  ];
  return [
    `${r.nomes} nomes e ${r.numeros} números vinculados`,
    falta.length ? `faltam: ${falta.join(", ")}` : null,
    r.semUso.length ? `arquivos sem uso: ${r.semUso.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Remove vínculos de uma imagem excluída. */
export const unlinkImage = (roster: Player[], id: string) =>
  roster.map((p) => {
    if (p.imgNome !== id && p.imgNumero !== id) return p;
    const q = { ...p };
    if (q.imgNome === id) delete q.imgNome;
    if (q.imgNumero === id) delete q.imgNumero;
    return q;
  });

export function sanitizeImages(v: unknown): TeamImage[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (i): i is TeamImage =>
      !!i &&
      typeof i === "object" &&
      typeof i.id === "string" &&
      typeof i.src === "string" &&
      typeof i.nome === "string",
  );
}

/* ---------- Navegador ---------- */

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Imagem inválida"));
    im.src = src;
  });

const readUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

/** Lê um PNG/JPEG; PNG pode ter as margens transparentes removidas. Lança erro se for totalmente transparente. */
export async function readTeamImage(file: File, trim: boolean): Promise<Omit<TeamImage, "id">> {
  const src = await readUrl(file);
  const im = await loadImg(src);
  const nome = baseName(file.name);
  const W = im.naturalWidth;
  const H = im.naturalHeight;
  if (!trim || !/png/i.test(file.type || file.name)) return { nome, src, w: W, h: H };
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  const band = Math.max(1, Math.floor(4_000_000 / Math.max(1, W)));
  for (let y = 0; y < H; y += band) {
    const bh = Math.min(band, H - y);
    const d = ctx.getImageData(0, y, W, bh).data;
    for (let r = 0; r < bh; r++) {
      const row = r * W * 4;
      for (let x = 0; x < W; x++) {
        if (d[row + x * 4 + 3]! > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y + r < y0) y0 = y + r;
          if (y + r > y1) y1 = y + r;
        }
      }
    }
  }
  if (x1 < 0) throw new Error(`${file.name}: imagem totalmente transparente`);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w === W && h === H) return { nome, src, w, h };
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  return { nome, src: out.toDataURL("image/png"), w, h };
}
