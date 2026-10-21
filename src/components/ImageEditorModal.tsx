import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brush,
  Eraser,
  PaintBucket,
  BoxSelect,
  Crop,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Ghost,
  X,
  Check,
  Trash2,
} from "lucide-react";

type Tool = "pincel" | "borracha" | "preencher" | "selecao";
type Rect = { x: number; y: number; w: number; h: number };

const SWATCHES = [
  "#000000",
  "#ffffff",
  "#20242b",
  "#e11d48",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#0ea5e9",
  "#2563eb",
  "#7c3aed",
  "#ec4899",
  "#00ffff",
  "#ff00ff",
  "#ffff00",
  "#8b5e3c",
  "#9ca3af",
];
const MAX_HISTORY = 40;

const hexToRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function cloneCanvas(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

export function ImageEditorModal({
  src,
  onSave,
  onCancel,
}: {
  src: string;
  onSave: (dataUrl: string, ratio: number) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [tool, setTool] = useState<Tool>("pincel");
  const [color, setColor] = useState("#e11d48");
  const [brush, setBrush] = useState(12);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [tip, setTip] = useState<"round" | "square">("round");
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [sel, setSel] = useState<Rect | null>(null);
  const [adj, setAdj] = useState({ brilho: 100, contraste: 100, saturacao: 100, matiz: 0 });
  const [resizePct, setResizePct] = useState(100);
  const undo = useRef<HTMLCanvasElement[]>([]);
  const redo = useRef<HTMLCanvasElement[]>([]);
  const [, bump] = useState(0);
  const drawing = useRef<{ last: { x: number; y: number }; base: HTMLCanvasElement } | null>(null);
  const selStart = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => canvasRef.current!.getContext("2d")!;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current!;
      c.width = img.naturalWidth || 1000;
      c.height = img.naturalHeight || 1000;
      ctx().drawImage(img, 0, 0, c.width, c.height);
      originalRef.current = cloneCanvas(c);
      setSize({ w: c.width, h: c.height });
      const fitZoom = Math.min(1, 640 / c.width, 520 / c.height);
      setZoom(Math.max(0.05, fitZoom));
      setReady(true);
    };
    img.src = src;
  }, [src]);

  const snapshot = useCallback(() => {
    undo.current.push(cloneCanvas(canvasRef.current!));
    if (undo.current.length > MAX_HISTORY) undo.current.shift();
    redo.current = [];
    bump((n) => n + 1);
  }, []);

  const restore = (from: HTMLCanvasElement) => {
    const c = canvasRef.current!;
    c.width = from.width;
    c.height = from.height;
    ctx().drawImage(from, 0, 0);
    setSize({ w: c.width, h: c.height });
    setSel(null);
  };
  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(cloneCanvas(canvasRef.current!));
    restore(prev);
    bump((n) => n + 1);
  }, []);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(cloneCanvas(canvasRef.current!));
    restore(next);
    bump((n) => n + 1);
  }, []);

  const deleteSel = useCallback(() => {
    if (!sel) return;
    snapshot();
    ctx().clearRect(sel.x, sel.y, sel.w, sel.h);
    setSel(null);
  }, [sel, snapshot]);

  // Atalhos próprios do editor: capturados antes do Desfazer do molde.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let handled = true;
      if (mod && k === "z" && !e.shiftKey) doUndo();
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) doRedo();
      else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        sel &&
        !(e.target instanceof HTMLInputElement)
      )
        deleteSel();
      else if (e.key === "Escape") onCancel();
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [doUndo, doRedo, deleteSel, sel, onCancel]);

  const pt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size.w,
      y: ((e.clientY - r.top) / r.height) * size.h,
    };
  };

  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = ctx();
    g.save();
    g.globalCompositeOperation = tool === "borracha" ? "destination-out" : "source-over";
    g.strokeStyle = color;
    g.lineWidth = brush;
    g.lineCap = tip === "round" ? "round" : "square";
    g.lineJoin = tip === "round" ? "round" : "miter";
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.restore();
  };

  const flood = (x0: number, y0: number) => {
    const c = canvasRef.current!;
    const g = ctx();
    const W = c.width,
      H = c.height;
    const x = Math.floor(x0),
      y = Math.floor(y0);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const i0 = (y * W + x) * 4;
    const t = [d[i0]!, d[i0 + 1]!, d[i0 + 2]!, d[i0 + 3]!];
    const [r, gr, b] = hexToRgb(color);
    const a = Math.round((brushOpacity / 100) * 255);
    if (t[0] === r && t[1] === gr && t[2] === b && t[3] === a) return;
    const tol = 32;
    const match = (i: number) =>
      Math.abs(d[i]! - t[0]!) <= tol &&
      Math.abs(d[i + 1]! - t[1]!) <= tol &&
      Math.abs(d[i + 2]! - t[2]!) <= tol &&
      Math.abs(d[i + 3]! - t[3]!) <= tol;
    const seen = new Uint8Array(W * H);
    const stack = [x, y];
    while (stack.length) {
      const py = stack.pop()!,
        px = stack.pop()!;
      let lx = px;
      while (lx >= 0 && !seen[py * W + lx] && match((py * W + lx) * 4)) lx--;
      lx++;
      let up = false,
        dn = false;
      for (let cx = lx; cx < W; cx++) {
        const p = py * W + cx;
        if (seen[p] || !match(p * 4)) break;
        seen[p] = 1;
        d[p * 4] = r!;
        d[p * 4 + 1] = gr!;
        d[p * 4 + 2] = b!;
        d[p * 4 + 3] = a;
        if (py > 0) {
          const q = p - W;
          const ok = !seen[q] && match(q * 4);
          if (ok && !up) {
            stack.push(cx, py - 1);
            up = true;
          } else if (!ok) up = false;
        }
        if (py < H - 1) {
          const q = p + W;
          const ok = !seen[q] && match(q * 4);
          if (ok && !dn) {
            stack.push(cx, py + 1);
            dn = true;
          } else if (!ok) dn = false;
        }
      }
    }
    g.putImageData(img, 0, 0);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!ready || e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tool === "preencher") {
      snapshot();
      flood(p.x, p.y);
      return;
    }
    if (tool === "selecao") {
      selStart.current = p;
      setSel({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    snapshot();
    // Traço desenhado numa camada temporária para que a opacidade fique uniforme no traço inteiro.
    drawing.current = { last: p, base: cloneCanvas(canvasRef.current!) };
    strokeLayer.current = document.createElement("canvas");
    strokeLayer.current.width = size.w;
    strokeLayer.current.height = size.h;
    paintTo({ x: p.x + 0.01, y: p.y });
  };
  const strokeLayer = useRef<HTMLCanvasElement | null>(null);

  const onMove = (e: React.PointerEvent) => {
    if (tool === "selecao" && selStart.current) {
      const p = pt(e),
        s = selStart.current;
      setSel({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      });
      return;
    }
    if (drawing.current) paintTo(pt(e));
  };
  const paintTo = (p: { x: number; y: number }) => {
    const dr = drawing.current;
    if (!dr) return;
    if (brushOpacity < 100 && tool === "pincel") {
      // Desenha o traço completo numa camada separada e recompõe com a opacidade escolhida.
      const sl = strokeLayer.current!;
      const sg = sl.getContext("2d")!;
      sg.strokeStyle = color;
      sg.lineWidth = brush;
      sg.lineCap = tip === "round" ? "round" : "square";
      sg.lineJoin = tip === "round" ? "round" : "miter";
      sg.beginPath();
      sg.moveTo(dr.last.x, dr.last.y);
      sg.lineTo(p.x, p.y);
      sg.stroke();
      const g = ctx();
      g.clearRect(0, 0, size.w, size.h);
      g.drawImage(dr.base, 0, 0);
      g.globalAlpha = brushOpacity / 100;
      g.drawImage(sl, 0, 0);
      g.globalAlpha = 1;
    } else stroke(dr.last, p);
    dr.last = p;
  };
  const onUp = () => {
    drawing.current = null;
    if (selStart.current) {
      selStart.current = null;
      setSel((s) => (s && s.w > 2 && s.h > 2 ? s : null));
    }
  };

  const crop = () => {
    if (!sel) return;
    snapshot();
    const c = canvasRef.current!;
    const r = {
      x: Math.round(sel.x),
      y: Math.round(sel.y),
      w: Math.max(1, Math.round(sel.w)),
      h: Math.max(1, Math.round(sel.h)),
    };
    const part = ctx().getImageData(r.x, r.y, r.w, r.h);
    c.width = r.w;
    c.height = r.h;
    ctx().putImageData(part, 0, 0);
    setSize({ w: r.w, h: r.h });
    setSel(null);
  };

  const applyAdjust = () => {
    if (adj.brilho === 100 && adj.contraste === 100 && adj.saturacao === 100 && adj.matiz === 0)
      return;
    snapshot();
    const c = canvasRef.current!;
    const base = cloneCanvas(c);
    const g = ctx();
    g.clearRect(0, 0, c.width, c.height);
    g.filter = `brightness(${adj.brilho}%) contrast(${adj.contraste}%) saturate(${adj.saturacao}%) hue-rotate(${adj.matiz}deg)`;
    g.drawImage(base, 0, 0);
    g.filter = "none";
    setAdj({ brilho: 100, contraste: 100, saturacao: 100, matiz: 0 });
  };

  const applyResize = () => {
    if (resizePct === 100) return;
    snapshot();
    const c = canvasRef.current!;
    const base = cloneCanvas(c);
    c.width = Math.max(1, Math.round((base.width * resizePct) / 100));
    c.height = Math.max(1, Math.round((base.height * resizePct) / 100));
    const g = ctx();
    g.imageSmoothingQuality = "high";
    g.drawImage(base, 0, 0, c.width, c.height);
    setSize({ w: c.width, h: c.height });
    setResizePct(100);
  };

  const save = () => {
    const c = canvasRef.current!;
    onSave(c.toDataURL("image/png"), c.height / Math.max(1, c.width));
  };

  const previewFilter = `brightness(${adj.brilho}%) contrast(${adj.contraste}%) saturate(${adj.saturacao}%) hue-rotate(${adj.matiz}deg)`;
  const dispW = size.w * zoom;
  const dispH = size.h * zoom;

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      key={t}
      onClick={() => setTool(t)}
      className={
        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] " +
        (tool === t
          ? "border-primary bg-primary text-primary-foreground"
          : "border-line text-foreground hover:border-primary hover:text-primary")
      }
    >
      {icon} {label}
    </button>
  );
  const btn =
    "flex items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:pointer-events-none";
  const slider = (label: string, key: keyof typeof adj, min: number, max: number, unit = "%") => (
    <label className="flex items-center gap-2">
      <span className="w-20 text-faint">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={adj[key]}
        onChange={(e) => setAdj({ ...adj, [key]: Number(e.target.value) })}
        className="flex-1 accent-primary"
      />
      <span className="w-10 text-right font-mono text-foreground">
        {adj[key]}
        {unit}
      </span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-label="Editar imagem do PowerClip"
        className="flex h-[min(92vh,820px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-lg border border-line bg-panel text-xs shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground">Editar Imagem do PowerClip</span>
          <button
            onClick={onCancel}
            aria-label="Fechar sem salvar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* Área de edição */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
              <button
                className={btn}
                onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))}
                aria-label="Reduzir zoom"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <span className="w-12 text-center font-mono text-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <button
                className={btn}
                onClick={() => setZoom((z) => Math.min(16, z * 1.25))}
                aria-label="Ampliar zoom"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                className={btn}
                onClick={() => setZoom(Math.max(0.05, Math.min(1, 640 / size.w, 520 / size.h)))}
              >
                Ajustar
              </button>
              <span className="mx-2 h-4 w-px bg-line" />
              <button
                className={btn + (grid ? " border-primary text-primary" : "")}
                onClick={() => setGrid((v) => !v)}
              >
                <Grid3x3 className="size-3.5" /> Grade
              </button>
              <button
                className={btn + (ghost ? " border-primary text-primary" : "")}
                onClick={() => setGhost((v) => !v)}
              >
                <Ghost className="size-3.5" /> Original
              </button>
              <span className="ml-auto font-mono text-faint">
                {size.w} × {size.h} px
              </span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto bg-canvas p-6"
              onWheel={(e) => {
                if (!e.ctrlKey && !e.metaKey) return;
                e.preventDefault();
                setZoom((z) => Math.min(16, Math.max(0.05, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
              }}
            >
              <div
                className="relative mx-auto"
                style={{
                  width: dispW,
                  height: dispH,
                  backgroundImage:
                    "conic-gradient(var(--color-muted) 25%, transparent 0 50%, var(--color-muted) 0 75%, transparent 0)",
                  backgroundSize: "16px 16px",
                }}
              >
                {ghost && originalRef.current && (
                  <img
                    src={src}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
                  />
                )}
                <canvas
                  ref={canvasRef}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  className={
                    "absolute inset-0 h-full w-full touch-none " +
                    (tool === "selecao" ? "cursor-crosshair" : "cursor-cell")
                  }
                  style={{
                    filter: previewFilter,
                    opacity: ghost ? 0.75 : 1,
                    imageRendering: zoom > 2 ? "pixelated" : "auto",
                  }}
                />
                {grid && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
                      backgroundSize: `${Math.max(8, dispW / 16)}px ${Math.max(8, dispW / 16)}px`,
                    }}
                  />
                )}
                {sel && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-primary bg-primary/10"
                    style={{
                      left: sel.x * zoom,
                      top: sel.y * zoom,
                      width: sel.w * zoom,
                      height: sel.h * zoom,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Ferramentas */}
          <div className="w-72 shrink-0 overflow-y-auto border-l border-line">
            <div className="space-y-2 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Ferramentas
              </div>
              <div className="grid grid-cols-2 gap-1">
                {toolBtn("pincel", <Brush className="size-3.5" />, "Pincel")}
                {toolBtn("borracha", <Eraser className="size-3.5" />, "Borracha")}
                {toolBtn("preencher", <PaintBucket className="size-3.5" />, "Preencher")}
                {toolBtn("selecao", <BoxSelect className="size-3.5" />, "Seleção")}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button className={btn} disabled={!sel} onClick={crop}>
                  <Crop className="size-3.5" /> Recortar
                </button>
                <button className={btn} disabled={!sel} onClick={deleteSel}>
                  <Trash2 className="size-3.5" /> Apagar área
                </button>
              </div>
              {tool === "selecao" && (
                <div className="text-[10px] text-faint">
                  Arraste para marcar uma área; depois recorte ou apague.
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-line px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Cor e pincel
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-background"
                  aria-label="Cor"
                />
                <span className="font-mono text-foreground">{color.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    title={s}
                    onClick={() => setColor(s)}
                    className={
                      "h-5 rounded border " +
                      (color === s ? "border-primary ring-1 ring-primary" : "border-line")
                    }
                    style={{ background: s }}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2">
                <span className="w-20 text-faint">Tamanho</span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={brush}
                  onChange={(e) => setBrush(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-10 text-right font-mono text-foreground">{brush}px</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-20 text-faint">Opacidade</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={brushOpacity}
                  onChange={(e) => setBrushOpacity(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-10 text-right font-mono text-foreground">{brushOpacity}%</span>
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  className={btn + (tip === "round" ? " border-primary text-primary" : "")}
                  onClick={() => setTip("round")}
                >
                  Ponta redonda
                </button>
                <button
                  className={btn + (tip === "square" ? " border-primary text-primary" : "")}
                  onClick={() => setTip("square")}
                >
                  Ponta quadrada
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-line px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Ajustes de cor
              </div>
              {slider("Brilho", "brilho", 0, 200)}
              {slider("Contraste", "contraste", 0, 200)}
              {slider("Saturação", "saturacao", 0, 200)}
              {slider("Tonalidade", "matiz", -180, 180, "°")}
              <button className={btn + " w-full"} onClick={applyAdjust}>
                Aplicar ajustes
              </button>
            </div>

            <div className="space-y-2 border-t border-line px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Redimensionar
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={resizePct}
                  onChange={(e) => setResizePct(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-10 text-right font-mono text-foreground">{resizePct}%</span>
              </label>
              <div className="text-[10px] text-faint">
                {Math.round((size.w * resizePct) / 100)} × {Math.round((size.h * resizePct) / 100)}{" "}
                px · o tamanho no molde não muda
              </div>
              <button className={btn + " w-full"} onClick={applyResize}>
                Aplicar tamanho
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <button className={btn} disabled={!undo.current.length} onClick={doUndo}>
            <Undo2 className="size-3.5" /> Desfazer
          </button>
          <button className={btn} disabled={!redo.current.length} onClick={doRedo}>
            <Redo2 className="size-3.5" /> Refazer
          </button>
          <span className="ml-auto" />
          <button className={btn} onClick={onCancel}>
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!ready}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <Check className="size-3.5" /> Salvar e Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
