/* Troca de um espaço de imagem do time (Layer.slot) pela imagem do jogador — função pura. */
import type { Layer } from "@/lib/importers";

export type SlotImage = { src: string; w: number; h: number };

/**
 * W/H: largura/altura da vista no tamanho do jogador; Wm: largura da vista no molde mãe.
 * Encaixe "contain" sem distorcer, ancorado no ponto fixo. Sem imagem → null (o espaço some).
 */
export function resolveTeamSlot(layer: Layer, o: { img: SlotImage | null; W: number; H: number; Wm: number }): Layer | null {
  const slot = layer.slot;
  if (!slot) return layer;
  const { img, W, H, Wm } = o;
  if (!img || !(img.w > 0) || !(img.h > 0)) return null;
  const aw = slot.scale ? layer.w * W : layer.w * Wm;
  const ah = aw * layer.ratio;
  const cx0 = (layer.cx - 0.5) * W;
  const cy0 = layer.cy * H;
  const r = img.h / img.w;
  let iw: number, ih: number;
  if (r * aw <= ah) {
    iw = aw;
    ih = aw * r;
  } else {
    ih = ah;
    iw = ah / r;
  }
  const xc = slot.h === "esquerda" ? cx0 - aw / 2 + iw / 2 : slot.h === "direita" ? cx0 + aw / 2 - iw / 2 : cx0;
  const yc = slot.v === "topo" ? cy0 - ah / 2 + ih / 2 : slot.v === "base" ? cy0 + ah / 2 - ih / 2 : cy0;
  const { slot: _s, paths: _p, ...rest } = layer;
  return { ...rest, src: img.src, kind: "imagem", w: iw / W, ratio: ih / iw, cx: xc / W + 0.5, cy: yc / H };
}

/** DPI efetivo da imagem na peça: pixels de largura / (largura em cm / 2,54). */
export const slotDpi = (imgPxW: number, widthCm: number) => (widthCm > 0 ? imgPxW / (widthCm / 2.54) : Infinity);
