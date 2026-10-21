import { useRef, useState } from "react";
import { attr, n, safeSrc } from "@/lib/svg-safe";
import {
  Crop,
  Crosshair,
  Maximize2,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Replace,
  Download,
  X,
} from "lucide-react";

export type PcArt = {
  src: string;
  cx: number;
  cy: number;
  w: number;
  ratio: number;
  clipped?: boolean;
  rot?: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  name?: string;
  init?: { cx: number; cy: number; w: number; ratio: number; rot: number };
  pre?: { cx: number; cy: number; w: number; rot: number } | undefined;
};

/** Transformação SVG da estampa: rotação e espelho em torno do próprio centro, sem alterar a geometria. */
export function artTransform(a: { rot?: number; flipX?: boolean; flipY?: boolean }, cx: number, cy: number) {
  const fx = a.flipX ? -1 : 1;
  const fy = a.flipY ? -1 : 1;
  const flip = fx === 1 && fy === 1 ? "" : ` translate(${n(cx)} ${n(cy)}) scale(${fx} ${fy}) translate(${n(-cx)} ${n(-cy)})`;
  return `rotate(${n(a.rot ?? 0)} ${n(cx)} ${n(cy)})${flip}`;
}

type Frame = { x: number; y: number; w: number; h: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

function NumField({ label, value, onChange, suffix = "cm" }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-14 text-faint">{label}</span>
      <input
        type="number"
        step="0.1"
        value={r2(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value.replace(",", "."));
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full min-w-0 rounded border border-line bg-background px-1.5 py-1 font-mono text-foreground"
      />
      <span className="text-faint">{suffix}</span>
    </label>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-t border-line px-3 py-2.5 space-y-1.5">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{title}</div>
    {children}
  </div>
);

const btn =
  "flex items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-foreground hover:border-primary hover:text-primary";

export function PowerClipEditor({
  art,
  frame,
  W,
  H,
  fileBase,
  onChange,
  onRemove,
  onExtract,
  onClose,
  features,
}: {
  art: PcArt;
  frame: Frame;
  W: number;
  H: number;
  fileBase: string;
  onChange: (a: PcArt) => void;
  onRemove: () => void;
  onExtract?: () => void;
  onClose: () => void;
  features?: { flip?: boolean; opacity?: boolean; replace?: boolean; reset?: boolean };
}) {
  const feat = { flip: true, opacity: true, replace: true, reset: true, ...features };
  const fileRef = useRef<HTMLInputElement>(null);
  const [askFormat, setAskFormat] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const aw = art.w * W;
  const ah = aw * art.ratio;
  const cxs = (art.cx - 0.5) * W;
  const cys = art.cy * H;
  const rot = art.rot ?? 0;
  const set = (p: Partial<PcArt>) => onChange({ ...art, ...p });
  const fromSvg = (x: number, y: number) => ({ cx: x / W + 0.5, cy: y / H });

  const center = () => set(fromSvg(frame.x + frame.w / 2, frame.y + frame.h / 2));
  const fit = () => {
    const t = (rot * Math.PI) / 180;
    const bw = aw * Math.abs(Math.cos(t)) + ah * Math.abs(Math.sin(t));
    const bh = aw * Math.abs(Math.sin(t)) + ah * Math.abs(Math.cos(t));
    const s = Math.min(frame.w / bw, frame.h / bh);
    set({ w: art.w * s, ...fromSvg(frame.x + frame.w / 2, frame.y + frame.h / 2) });
  };
  const reset = () => {
    const i = art.init;
    set({ ...(i ?? {}), rot: i?.rot ?? 0, flipX: false, flipY: false, opacity: 1 });
  };
  const rotTo = (deg: number) => set({ rot: ((deg % 360) + 360) % 360 });

  const replace = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => set({ src, name: file.name, ratio: img.naturalHeight / Math.max(1, img.naturalWidth) });
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };
  const extract = (fmt: "png" | "jpg" | "svg") => {
    setAskFormat(false);
    setTimeout(() => onExtract?.(), 0);
    const name = `${fileBase}.${fmt}`;
    if (fmt === "svg") {
      if (art.src.startsWith("data:image/svg")) return download(art.src, name);
      const img = new Image();
      img.onload = () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.naturalWidth}" height="${img.naturalHeight}" viewBox="0 0 ${img.naturalWidth} ${img.naturalHeight}"><image href="${attr(safeSrc(art.src))}" width="${img.naturalWidth}" height="${img.naturalHeight}"/></svg>`;
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        download(url, name);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      img.src = art.src;
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || 2000;
      c.height = img.naturalHeight || Math.round(c.width * art.ratio);
      const g = c.getContext("2d")!;
      if (fmt === "jpg") {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, c.width, c.height);
      }
      g.drawImage(img, 0, 0, c.width, c.height);
      download(c.toDataURL(fmt === "png" ? "image/png" : "image/jpeg", 0.95), name);
    };
    img.src = art.src;
  };

  return (
    <div
      className={
        "absolute left-3 top-3 z-20 w-64 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-md border bg-panel text-xs shadow-lg " +
        (dragOver ? "border-primary" : "border-line")
      }
      onPointerDown={(e) => e.stopPropagation()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (feat.replace && f && f.type.startsWith("image/")) replace(f);
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Crop className="size-3.5 text-primary" /> Editor do PowerClip
        </span>
        <button onClick={onClose} aria-label="Fechar editor" className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="px-3 pb-2 text-[11px] text-muted-foreground truncate">Arquivo: {art.name ?? "Estampa"}</div>

      <Section title="Posição e tamanho">
        <NumField label="X" value={cxs - aw / 2 - frame.x} onChange={(v) => set(fromSvg(frame.x + v + aw / 2, cys))} />
        <NumField label="Y" value={cys - ah / 2 - frame.y} onChange={(v) => set(fromSvg(cxs, frame.y + v + ah / 2))} />
        <NumField label="Largura" value={aw} onChange={(v) => v > 0 && set({ w: v / W })} />
        <NumField label="Altura" value={ah} onChange={(v) => v > 0 && set({ w: v / art.ratio / W })} />
        <div className="text-[10px] text-faint">X e Y medidos a partir do canto superior esquerdo do retângulo.</div>
      </Section>

      <Section title="Posicionamento">
        <button className={btn + " w-full"} onClick={center}><Crosshair className="size-3.5" /> Centralizar no Retângulo</button>
        <button className={btn + " w-full"} onClick={fit}><Maximize2 className="size-3.5" /> Ajustar Tamanho 100%</button>
        {feat.reset && <button className={btn + " w-full"} onClick={reset}><RotateCcw className="size-3.5" /> Redefinir Posição e Tamanho</button>}
      </Section>

      <Section title="Transformação">
        <div className="grid grid-cols-3 gap-1">
          {[90, 180, 270].map((d) => (
            <button key={d} className={btn} onClick={() => rotTo(rot + d)}>
              <RotateCw className="size-3" /> {d}°
            </button>
          ))}
        </div>
        <NumField label="Rotação" value={rot} suffix="°" onChange={rotTo} />
        {feat.flip && <div className="grid grid-cols-2 gap-1">
          <button className={btn + (art.flipX ? " border-primary text-primary" : "")} onClick={() => set({ flipX: !art.flipX })}>
            <FlipHorizontal2 className="size-3.5" /> Espelhar H
          </button>
          <button className={btn + (art.flipY ? " border-primary text-primary" : "")} onClick={() => set({ flipY: !art.flipY })}>
            <FlipVertical2 className="size-3.5" /> Espelhar V
          </button>
        </div>}
      </Section>

      {feat.opacity && <Section title="Propriedades">
        <label className="flex items-center gap-2">
          <span className="w-14 text-faint">Opacidade</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((art.opacity ?? 1) * 100)}
            onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
            className="flex-1 accent-primary"
          />
          <span className="w-9 text-right font-mono text-foreground">{Math.round((art.opacity ?? 1) * 100)}%</span>
        </label>
      </Section>}

      <Section title="Arquivo">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) replace(f);
            e.target.value = "";
          }}
        />
        {feat.replace && <>
        <button className={btn + " w-full"} onClick={() => fileRef.current?.click()}>
          <Replace className="size-3.5" /> Substituir Imagem
        </button>
        <div className="text-[10px] text-faint text-center">ou arraste uma imagem para este painel</div>
        </>}
        {askFormat ? (
          <div className="grid grid-cols-3 gap-1">
            {(["png", "jpg", "svg"] as const).map((f) => (
              <button key={f} className={btn} onClick={() => extract(f)}>.{f}</button>
            ))}
          </div>
        ) : (
          <button className={btn + " w-full"} onClick={() => setAskFormat(true)}>
            <Download className="size-3.5" /> Extrair Arquivo
          </button>
        )}
        <button className={btn + " w-full hover:border-destructive hover:text-destructive"} onClick={onRemove}>
          <X className="size-3.5" /> Remover do PowerClip
        </button>
      </Section>
    </div>
  );
}
