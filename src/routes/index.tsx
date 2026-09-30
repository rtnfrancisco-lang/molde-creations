import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ChevronDown,
  Plus,
  Shirt,
  Wand2,
  Ruler,
  Table2,
  Save,
  RotateCcw,
  ImagePlus,
  Download,
  Crown,
  Trash2,
  Undo2,
  Redo2,
  Palette,
  PanelRightClose,
  ChevronRight,
  X,
  Crop,
  MousePointer2,
  Spline,
  PenTool,
  ZoomIn,
  Maximize,
  FileUp,
  Layers as LayersIcon,
  ArrowUpToLine,
  ArrowDownToLine,
  Image as ImageIcon,
  FileText,
  Eye,
  EyeOff,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  buildPath,
  importSvg,
  pdfToImage,
  readDataUrl,
  imageRatio,
  vectorDataUrl,
  layerMarkup,
  layerPathD,
  type Layer,
} from "@/lib/importers";
import { activeView } from "@/lib/active-view";
import {
  offsetPathD,
  BLEED_OFFSET_CM,
  SAFETY_OFFSET_CM,
  TECHNICAL_OFFSET_OPTIONS,
} from "@/lib/vector-offset";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoldeCore — Motor de Moldes" },
      {
        name: "description",
        content:
          "MoldeCore é um sistema de automação de moldes de roupa para sublimação. Crie, gradue e edite moldes vetoriais.",
      },
      { property: "og:title", content: "MoldeCore — Motor de Moldes" },
      {
        property: "og:description",
        content: "Automação de moldes de roupa para sublimação — frente, costas e mangas vetoriais.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/* ================= Tipos e padrões ================= */

type Field = "bodyHeight" | "bodyWidth" | "sleeveHeight" | "sleeveWidth";
type Measurements = Record<Field, number>;
type Size = "PP" | "P" | "M" | "G" | "GG" | "XG" | "XG2";
type Grading = Record<Size, Measurements>;
type View = "frente" | "costas" | "mangaEsq" | "mangaDir";
type Node = { x: number; y: number; smooth: boolean; hIn?: { x: number; y: number }; hOut?: { x: number; y: number } };
type Shapes = Record<View, Node[]>;
type Artwork = { src: string; cx: number; cy: number; w: number; ratio: number; clipped?: boolean; rot?: number };
type Artworks = Record<View, Artwork | null>;
type Layers = Record<View, Layer[]>;
const NO_LAYERS: Layers = { frente: [], costas: [], mangaEsq: [], mangaDir: [] };
type ColorTarget = "contorno" | "preenchimento";
type PartStyle = { stroke: string | null; fill: string | null };
type Styles = Record<View, PartStyle>;
const NO_ART: Artworks = { frente: null, costas: null, mangaEsq: null, mangaDir: null };
const NO_STYLE: PartStyle = { stroke: null, fill: null };
const DEFAULT_STYLES: Styles = { frente: NO_STYLE, costas: NO_STYLE, mangaEsq: NO_STYLE, mangaDir: NO_STYLE };
type Tool = "selecao" | "forma" | "caneta" | "zoom" | "fita" | "texto";
type TextElement = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
};
type ClothingType = "Camiseta" | "Moletom" | "Regata" | "Manga Longa" | "Camisa Infantil" | "Camisa Baby Look";
type SizeOption = { id: Size; label: string };

/* Fonte única de verdade dos tamanhos disponíveis e dos rótulos exibidos. */
const SIZES_BY_GARMENT: Record<ClothingType, readonly SizeOption[]> = {
  Camiseta: ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({ id: id as Size, label: id })),
  Moletom: ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({ id: id as Size, label: id })),
  Regata: ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({ id: id as Size, label: id })),
  "Manga Longa": ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({ id: id as Size, label: id })),
  "Camisa Infantil": ["2ANOS", "4ANOS", "6ANOS", "8ANOS", "10ANOS", "12ANOS", "14ANOS"].map(
    (label, index) => ({
      id: (["PP", "P", "M", "G", "GG", "XG", "XG2"] as Size[])[index]!,
      label,
    }),
  ),
  "Camisa Baby Look": ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({
    id: id as Size,
    label: `BL ${id}`,
  })),
};

const sizesForGarment = (clothingType: ClothingType): readonly SizeOption[] => SIZES_BY_GARMENT[clothingType];
const sizeIdsForGarment = (clothingType: ClothingType): readonly Size[] => sizesForGarment(clothingType).map((option) => option.id);
/* Lista completa de tamanhos (todas as peças). */
const SIZES: readonly Size[] = ["PP", "P", "M", "G", "GG", "XG", "XG2"];

const FIELDS: { key: Field; label: string; group: string }[] = [
  { key: "bodyHeight", label: "Altura do Corpo", group: "Corpo" },
  { key: "bodyWidth", label: "Largura do Corpo", group: "Corpo" },
  { key: "sleeveHeight", label: "Altura da Manga", group: "Manga" },
  { key: "sleeveWidth", label: "Largura da Manga", group: "Manga" },
];

const d = (a: number, b: number, c: number, e: number): Measurements => ({
  bodyHeight: a,
  bodyWidth: b,
  sleeveHeight: c,
  sleeveWidth: e,
});

const DEFAULT_TABLE: Grading = {
  PP: d(68, 48, 20, 18),
  P: d(70, 50, 21, 19),
  M: d(72, 52, 22, 20),
  G: d(74, 54, 23, 21),
  GG: d(76, 56, 24, 22),
  XG: d(78, 58, 25, 23),
  XG2: d(80, 60, 26, 24),
};

/* ================= Tabelas pré-definidas por tipo de peça (Molde Mãe = M) ================= */

const INFANTIL_TABLE: Grading = {
  PP: d(42, 32, 13, 12),
  P: d(47, 35, 14.5, 13),
  M: d(51, 38, 16, 14),
  G: d(56, 41, 17.5, 15),
  GG: d(61, 44, 19, 16),
  XG: d(65, 47, 20.5, 17),
  XG2: d(69, 50, 22, 18),
};

const BABY_LOOK_TABLE: Grading = {
  PP: d(56, 38, 13, 13.5),
  P: d(58, 40, 14, 14.5),
  M: d(60, 43, 15, 15.5),
  G: d(62, 46, 16, 16.5),
  GG: d(64, 49, 17, 17.5),
  XG: d(66, 52, 18, 18.5),
  XG2: d(68, 55, 19, 19.5),
};

const NEW_CLOTHING_TYPES: ClothingType[] = ["Camisa Infantil", "Camisa Baby Look"];

const PRESET_TABLES: Partial<Record<ClothingType, Grading>> = {
  "Camisa Infantil": INFANTIL_TABLE,
  "Camisa Baby Look": BABY_LOOK_TABLE,
};

/* ===== Nomenclatura dinâmica de tamanho / rótulo técnico ===== */

/* Rótulo sempre derivado da configuração do tipo de peça. */
const sizeLabel = (clothingType: ClothingType, size: Size): string =>
  sizesForGarment(clothingType).find((option) => option.id === size)?.label ?? size;

/* Molde Mãe padrão de cada tipo de peça.
   Na grade infantil, o id interno M é a âncora estável correspondente ao tamanho 6ANOS.
   Isso preserva referências existentes de estampas sem alterar sua posição. */
const DEFAULT_MOTHER: Record<ClothingType, Size> = {
  Camiseta: "M",
  Moletom: "M",
  Regata: "M",
  "Manga Longa": "M",
  "Camisa Infantil": "M",
  "Camisa Baby Look": "M",
};

/* Nome legível da parte do molde a partir da vista ativa */
const partLabel = (view: View): string => {
  switch (view) {
    case "frente":
      return "FRENTE";
    case "costas":
      return "COSTAS";
    case "mangaEsq":
      return "MANGA ESQ";
    case "mangaDir":
      return "MANGA DIR";
  }
};

/* Texto do indicador técnico (canto superior esquerdo): [Tamanho] [Parte] */
const techLabel = (clothingType: ClothingType, size: Size, view: View): string =>
  `${sizeLabel(clothingType, size)} ${partLabel(view)}`;

/* Nome do arquivo exportado: MoldeCore_BL_M_FRENTE / MoldeCore_6ANOS_COSTAS */
const exportName = (clothingType: ClothingType, size: Size, view: View): string =>
  `MoldeCore_${techLabel(clothingType, size, view).replace(/\s+/g, "_")}`;

const bodyShape = (neckDepth: number): Node[] => [
  { x: 0.33, y: 0, smooth: false },
  { x: 0.4, y: neckDepth * 0.7, smooth: true },
  { x: 0.5, y: neckDepth, smooth: true },
  { x: 0.6, y: neckDepth * 0.7, smooth: true },
  { x: 0.67, y: 0, smooth: false },
  { x: 0.92, y: 0.05, smooth: false },
  { x: 0.89, y: 0.15, smooth: true },
  { x: 0.92, y: 0.24, smooth: true },
  { x: 1, y: 0.28, smooth: false },
  { x: 1, y: 1, smooth: false },
  { x: 0, y: 1, smooth: false },
  { x: 0, y: 0.28, smooth: false },
  { x: 0.08, y: 0.24, smooth: true },
  { x: 0.11, y: 0.15, smooth: true },
  { x: 0.08, y: 0.05, smooth: false },
];

const sleeveShape = (): Node[] => [
  { x: 0, y: 0.32, smooth: false },
  { x: 0.22, y: 0.1, smooth: true },
  { x: 0.5, y: 0, smooth: true },
  { x: 0.78, y: 0.1, smooth: true },
  { x: 1, y: 0.32, smooth: false },
  { x: 0.9, y: 1, smooth: false },
  { x: 0.1, y: 1, smooth: false },
];

const DEFAULT_SHAPES: Shapes = {
  frente: bodyShape(0.12),
  costas: bodyShape(0.04),
  mangaEsq: sleeveShape(),
  mangaDir: sleeveShape().map((n) => ({ ...n, x: 1 - n.x })),
};

const TOOLS: { k: Tool; label: string; icon: typeof Ruler; key: string }[] = [
  { k: "selecao", label: "Ferramenta Seleção", icon: MousePointer2, key: "V" },
  { k: "forma", label: "Ferramenta Forma / Editar Nós", icon: Spline, key: "F" },
  { k: "caneta", label: "Ferramenta Caneta", icon: PenTool, key: "P" },
  { k: "zoom", label: "Ferramenta Zoom", icon: ZoomIn, key: "Z" },
  { k: "fita", label: "Fita Métrica Digital", icon: Ruler, key: "M" },
  { k: "texto", label: "Ferramenta Texto", icon: Type, key: "T" },
];

const TOOL_HINTS: Record<Tool, string> = {
  selecao: "Arraste o contorno ou a estampa para mover · arraste a alça do canto para escalar",
  forma: "Arraste nós e alças · duplo clique adiciona nó · Alt+clique remove · Shift+clique alterna reta/curva",
  caneta: "Clique para criar nós · clique e arraste para curvas · clique no 1º nó ou Enter fecha · Esc cancela",
  zoom: "Clique para aproximar · Alt+clique afasta · arraste para mover a vista · roda do mouse também dá zoom",
  fita: "Clique em dois pontos para medir a distância real em cm",
  texto: "Clique no canvas para inserir texto · arraste o texto para reposicionar",
};

const LS_GRADING = "moldecore.tabelaMedidas";
const LS_MOTHER = "moldecore.moldeMae";
const LS_ART = "moldecore.estampas";
const LS_STYLES = "moldecore.cores";
const LS_SHAPES = "moldecore.formas";
const LS_LAYERS = "moldecore.camadas";
const LS_PROFILES = "moldecore.perfisGrades";
const LS_ACTIVE_PROFILE = "moldecore.perfilGradeAtivo";
const DEFAULT_PROFILE_NAME = "Padrão MoldeCore";

type ProfileTables = Record<ClothingType, Grading>;
type GradeProfile = { name: string; tables: ProfileTables };

const cloneGrading = (grading: Grading): Grading =>
  Object.fromEntries(
    Object.entries(grading).map(([size, measurements]) => [size, { ...measurements }]),
  ) as Grading;

const defaultTablesForProfiles = (): ProfileTables => ({
  Camiseta: cloneGrading(DEFAULT_TABLE),
  Moletom: cloneGrading(DEFAULT_TABLE),
  Regata: cloneGrading(DEFAULT_TABLE),
  "Manga Longa": cloneGrading(DEFAULT_TABLE),
  "Camisa Infantil": cloneGrading(INFANTIL_TABLE),
  "Camisa Baby Look": cloneGrading(BABY_LOOK_TABLE),
});

const readGradeProfiles = (): GradeProfile[] => {
  try {
    const raw = localStorage.getItem(LS_PROFILES);
    if (!raw) return [{ name: DEFAULT_PROFILE_NAME, tables: defaultTablesForProfiles() }];
    const parsed = JSON.parse(raw) as GradeProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ name: DEFAULT_PROFILE_NAME, tables: defaultTablesForProfiles() }];
    }
    return parsed.map((profile) => ({
      name: profile.name,
      tables: { ...defaultTablesForProfiles(), ...profile.tables },
    }));
  } catch {
    return [{ name: DEFAULT_PROFILE_NAME, tables: defaultTablesForProfiles() }];
  }
};

const saveGradeProfiles = (profiles: GradeProfile[]) => {
  try {
    localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
  } catch {
    /* O armazenamento local pode estar indisponível ou cheio. */
  }
};

const ProfileDock = ({
  profiles,
  activeProfile,
  onSelect,
  onCreate,
  onDelete,
}: {
  profiles: GradeProfile[];
  activeProfile: string;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onDelete: () => void;
}) => {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Abrir configurações de grade"
        aria-label="Abrir configurações de grade"
        aria-expanded={false}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-md border border-r-0 border-line bg-panel px-2 py-3 text-muted-foreground shadow-xl transition-colors hover:bg-cyan/10 hover:text-cyan"
      >
        <ChevronRight className="size-4" />
        <span className="[writing-mode:vertical-rl] text-[10px] font-mono uppercase tracking-[0.14em]">
          Configurações de Grade
        </span>
      </button>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-line bg-panel p-3 transition-all duration-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Recolher configurações de grade"
          aria-label="Recolher configurações de grade"
          aria-expanded={true}
          className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-panel2 text-muted-foreground transition-colors hover:bg-cyan/10 hover:text-cyan"
        >
          <PanelRightClose className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Tabela de Tamanhos</p>
          <h2 className="text-sm font-semibold text-foreground">Perfil de Grade do Cliente</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCreate}
            title="Novo Perfil"
            aria-label="Novo Perfil"
            className="grid size-8 place-items-center rounded-md border border-line bg-panel2 text-cyan transition-colors hover:bg-cyan/10"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Excluir perfil ativo"
            aria-label="Excluir perfil ativo"
            disabled={profiles.length <= 1 || activeProfile === DEFAULT_PROFILE_NAME}
            className="grid size-8 place-items-center rounded-md border border-line bg-panel2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <select
        value={activeProfile}
        onChange={(event) => onSelect(event.target.value)}
        aria-label="Perfil de Grade do Cliente"
        className="h-9 w-full rounded-md border border-input bg-panel2 px-3 text-sm text-foreground outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
      >
        {profiles.map((profile) => (
          <option key={profile.name} value={profile.name}>
            {profile.name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-[10px] leading-snug text-faint">
        Cada perfil mantém tabelas independentes para peças adultas, infantis e Baby Look.
      </p>
    </section>
  );
};

const saveLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* grande demais para o armazenamento local */
  }
};

const LIBRARY = [
  { name: "Camiseta Clássica — Sublimação", size: "M", active: true },
  { name: "Moletom Oversized", size: "G" },
  { name: "Regata Nadador", size: "P" },
  { name: "Gola Careca — Manga Longa", size: "GG" },
];

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/* Limites absolutos (X_min, X_max, Y_min, Y_max) de um traçado "d".
   O motor de offset devolve só M/L (polilinha), então os pares de números são
   lidos na ordem em que aparecem. Serve para o quadro de mídia colar exatamente
   na Linha Azul de Sangria, sem margem nem padding. */

const pathBounds = (d: string): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]!);
    const y = Number(nums[i + 1]!);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
};

/* ================= Página ================= */

const PLOTTER_MARGIN = 2; // margem de reserva do quadro de mídia (usada só se a sangria não puder ser lida)

function CanvasContextMenu({
  x,
  y,
  disabled,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onBringForward,
  onSendBackward,
  onPowerClip,
}: {
  x: number;
  y: number;
  disabled: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onPowerClip: () => void;
}) {
  const itemClass =
    "flex w-full items-center justify-between gap-5 rounded px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className="fixed z-[100] min-w-52 rounded-lg border border-line bg-panel p-1.5 shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 300) }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" className={itemClass} disabled={disabled} onClick={onCut}>
        <span>Recortar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+X</span>
      </button>
      <button type="button" className={itemClass} disabled={disabled} onClick={onCopy}>
        <span>Copiar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+C</span>
      </button>
      <button type="button" className={itemClass} onClick={onPaste}>
        <span>Colar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+V</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={itemClass} disabled={disabled} onClick={onDelete}>
        <span>Excluir</span>
        <span className="font-mono text-[10px] text-muted-foreground">Delete</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={itemClass} disabled={disabled} onClick={onBringForward}>
        <span>Trazer para Frente</span>
        <span className="font-mono text-[10px] text-muted-foreground">Camada</span>
      </button>
      <button type="button" className={itemClass} disabled={disabled} onClick={onSendBackward}>
        <span>Enviar para Trás</span>
        <span className="font-mono text-[10px] text-muted-foreground">Camada</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={itemClass} disabled={disabled} onClick={onPowerClip}>
        <span>Aplicar PowerClip</span>
        <span className="font-mono text-[10px] text-muted-foreground">Enter</span>
      </button>
    </div>
  );
}

const TEXT_FONTS = ["Arial", "Impact", "Montserrat", "Bebas Neue", "Roboto", "Comic Sans MS"];

type TextWorkspaceProps = {
  tool: Tool;
};

function TextWorkspace({ tool }: TextWorkspaceProps) {
  const [texts, setTexts] = useState<TextElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const selected = texts.find((item) => item.id === selectedId) ?? null;
  const updateSelected = (patch: Partial<TextElement>) => {
    if (!selectedId) return;
    setTexts((items) => items.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  };

  useEffect(() => {
    const onCanvasPointerDown = (event: PointerEvent) => {
      if (tool !== "texto") return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-text-workspace]") || !target.closest("svg")) return;
      const id = `texto-${Date.now()}`;
      const item: TextElement = {
        id,
        text: "Texto",
        x: event.clientX,
        y: event.clientY,
        fontFamily: "Arial",
        fontSize: 24,
        bold: false,
        italic: false,
        underline: false,
        align: "left",
        color: "#20242b",
      };
      setTexts((items) => [...items, item]);
      setSelectedId(id);
      setEditingId(id);
      setDraft(item.text);
      event.preventDefault();
    };
    document.addEventListener("pointerdown", onCanvasPointerDown, true);
    return () => document.removeEventListener("pointerdown", onCanvasPointerDown, true);
  }, [tool]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      setTexts((items) => items.map((item) => (item.id === drag.id ? { ...item, x: event.clientX - drag.dx, y: event.clientY - drag.dy } : item)));
    };
    const stop = () => setDrag(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
  }, [drag]);

  const finishEditing = () => {
    if (!editingId) return;
    setTexts((items) => items.map((item) => (item.id === editingId ? { ...item, text: draft || "Texto" } : item)));
    setEditingId(null);
  };

  return (
    <div data-text-workspace className="pointer-events-none fixed inset-0 z-[80]">
      {(tool === "texto" || selected) && (
        <div className="pointer-events-auto fixed left-16 right-20 top-14 flex min-h-12 items-center gap-2 border-b border-line bg-panel px-3 py-2 shadow-md">
          <span className="mr-1 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Texto</span>
          <select value={selected?.fontFamily ?? "Arial"} onChange={(event) => updateSelected({ fontFamily: event.target.value })} className="h-8 rounded-md border border-input bg-panel2 px-2 text-xs text-foreground">
            {TEXT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <input type="number" min="1" value={selected?.fontSize ?? 24} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) || 1 })} className="h-8 w-16 rounded-md border border-input bg-panel2 px-2 text-xs text-foreground" aria-label="Tamanho da fonte" />
          <button type="button" title="Negrito" onClick={() => updateSelected({ bold: !selected?.bold })} className={`grid size-8 place-items-center rounded-md border border-line ${selected?.bold ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><Bold className="size-4" /></button>
          <button type="button" title="Itálico" onClick={() => updateSelected({ italic: !selected?.italic })} className={`grid size-8 place-items-center rounded-md border border-line ${selected?.italic ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><Italic className="size-4" /></button>
          <button type="button" title="Sublinhado" onClick={() => updateSelected({ underline: !selected?.underline })} className={`grid size-8 place-items-center rounded-md border border-line ${selected?.underline ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><Underline className="size-4" /></button>
          <div className="ml-1 flex rounded-md border border-line bg-panel2 p-0.5">
            <button type="button" title="Alinhar à esquerda" onClick={() => updateSelected({ align: "left" })} className={`grid size-7 place-items-center rounded ${selected?.align === "left" ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><AlignLeft className="size-4" /></button>
            <button type="button" title="Centralizar" onClick={() => updateSelected({ align: "center" })} className={`grid size-7 place-items-center rounded ${selected?.align === "center" ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><AlignCenter className="size-4" /></button>
            <button type="button" title="Alinhar à direita" onClick={() => updateSelected({ align: "right" })} className={`grid size-7 place-items-center rounded ${selected?.align === "right" ? "bg-cyan/20 text-cyan" : "text-muted-foreground"}`}><AlignRight className="size-4" /></button>
          </div>
          {selected && <input type="color" value={selected.color} onChange={(event) => updateSelected({ color: event.target.value })} title="Cor do texto" className="size-8 cursor-pointer rounded border border-line bg-panel2 p-0.5" />}
        </div>
      )}
      {texts.map((item) => (
        <div key={item.id} className={`pointer-events-auto fixed cursor-move select-none rounded-sm px-1 ${selectedId === item.id ? "outline outline-1 outline-cyan/70" : ""}`} style={{ left: item.x, top: item.y, color: item.color, fontFamily: item.fontFamily, fontSize: `${item.fontSize}pt`, fontWeight: item.bold ? 700 : 400, fontStyle: item.italic ? "italic" : "normal", textDecoration: item.underline ? "underline" : "none", textAlign: item.align, transform: item.align === "center" ? "translateX(-50%)" : item.align === "right" ? "translateX(-100%)" : undefined }} onPointerDown={(event) => { event.stopPropagation(); setSelectedId(item.id); setDrag({ id: item.id, dx: event.clientX - item.x, dy: event.clientY - item.y }); }} onDoubleClick={() => { setEditingId(item.id); setDraft(item.text); }}>
          {editingId === item.id ? <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={finishEditing} onKeyDown={(event) => { if (event.key === "Enter") finishEditing(); }} className="min-w-24 border border-cyan bg-background px-1 text-foreground outline-none" style={{ font: "inherit", textAlign: item.align }} /> : item.text}
        </div>
      ))}
    </div>
  );
}

function Index() {
  const [clothingType, setClothingType] = useState<ClothingType>("Camiseta");
  const tamanhosExibidos =
    clothingType === "Camisa Infantil"
      ? ["2ANOS", "4ANOS", "6ANOS", "8ANOS", "10ANOS", "12ANOS", "14ANOS"]
      : ["PP", "P", "M", "G", "GG", "XG"];
  /* Botões da barra de TAMANHO: cada rótulo de tamanhosExibidos com o seu id
     interno (na grade infantil, 6ANOS corresponde ao id M). Assim a barra só
     mostra os tamanhos que realmente existem na peça selecionada. */
  const visibleSizeOptions = sizesForGarment(clothingType).filter(
    (o) => tamanhosExibidos.includes(o.label) || tamanhosExibidos.includes(o.id),
  );
  const [table, setTable] = useState<Grading>(DEFAULT_TABLE);
  const [profiles, setProfiles] = useState<GradeProfile[]>(() => [{ name: DEFAULT_PROFILE_NAME, tables: defaultTablesForProfiles() }]);
  const [activeProfile, setActiveProfile] = useState(DEFAULT_PROFILE_NAME);
  const profileRootRef = useRef<Root | null>(null);
  const profileHostRef = useRef<HTMLDivElement | null>(null);
  const [mother, setMother] = useState<Size>("M");
  const [artworks, setArtworks] = useState<Artworks>(NO_ART);
  const [layers, setLayers] = useState<Layers>(NO_LAYERS);
  const [selLayer, setSelLayer] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [importMsg, setImportMsg] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("preenchimento");
  const [pcEdit, setPcEdit] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRootRef = useRef<Root | null>(null);
  const contextMenuHostRef = useRef<HTMLDivElement | null>(null);
  const clipboardLayerRef = useRef<Layer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shapes, setShapes] = useState<Shapes>(DEFAULT_SHAPES);
  const [size, setSize] = useState<Size>("M");
  const [view, setView] = useState<View>("frente");
  const [panel, setPanel] = useState<"medidas" | "tabela">("medidas");
  const [overlay, setOverlay] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [tool, setTool] = useState<Tool>("forma");
  const [fitSignal, setFitSignal] = useState(0);
  const [showSeam, setShowSeam] = useState(true);
  const [showBleed, setShowBleed] = useState(true);
  const [showSafety, setShowSafety] = useState(true);
  const [plotterOpen, setPlotterOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState<"pdf" | "png">("pdf");
  const [hideTech, setHideTech] = useState(false);
  const [cropRect, setCropRect] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<TextWorkspace tool={tool} />);
    return () => {
      root.unmount();
      host.remove();
    };
  }, [tool]);

  const selectedLayer = () => {
    if (!selLayer) return null;
    return layers[view].find((layer) => String((layer as Layer & { id?: string }).id) === selLayer) ?? null;
  };

  const copySelectedLayer = () => {
    const selected = selectedLayer();
    if (!selected) return;
    clipboardLayerRef.current = structuredClone(selected);
    setMenu(null);
  };

  const deleteSelectedLayer = () => {
    if (!selectedLayer()) return;
    checkpoint("layers");
    setLayers((current) => {
      const next = { ...current, [view]: current[view].filter((layer) => String((layer as Layer & { id?: string }).id) !== selLayer) };
      saveLS(LS_LAYERS, next);
      return next;
    });
    setSelLayer(null);
    setMenu(null);
  };

  const pasteLayer = () => {
    const source = clipboardLayerRef.current;
    if (!source) return;
    const pasted = structuredClone(source) as Layer & Record<string, unknown>;
    const sourceId = String((pasted as Layer & { id?: string }).id ?? "camada");
    (pasted as Record<string, unknown>)["id"] = `${sourceId}-copia-${Date.now()}`;
    if (typeof pasted["x"] === "number") pasted["x"] += 10;
    if (typeof pasted["y"] === "number") pasted["y"] += 10;
    if (typeof pasted.cx === "number") pasted.cx += 10;
    if (typeof pasted.cy === "number") pasted.cy += 10;
    checkpoint("layers");
    setLayers((current) => {
      const next = { ...current, [view]: [...current[view], pasted] };
      saveLS(LS_LAYERS, next);
      return next;
    });
    setSelLayer(String((pasted as Layer & { id?: string }).id));
    setMenu(null);
  };

  const cutSelectedLayer = () => {
    copySelectedLayer();
    deleteSelectedLayer();
  };

  const moveSelectedLayer = (direction: "front" | "back") => {
    if (!selLayer) return;
    const current = layers[view];
    const index = current.findIndex((layer) => String((layer as Layer & { id?: string }).id) === selLayer);
    if (index < 0) return;
    const target = direction === "front" ? Math.min(current.length - 1, index + 1) : Math.max(0, index - 1);
    if (target === index) return;
    checkpoint("layers");
    const nextView = [...current];
    const [layer] = nextView.splice(index, 1);
    if (layer) nextView.splice(target, 0, layer);
    setLayers((all) => {
      const next = { ...all, [view]: nextView };
      saveLS(LS_LAYERS, next);
      return next;
    });
    setMenu(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      const modifier = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (modifier && key === "c" && !typing) {
        e.preventDefault();
        copySelectedLayer();
        return;
      }
      if (modifier && key === "v" && !typing) {
        e.preventDefault();
        pasteLayer();
        return;
      }
      if (modifier && key === "x" && !typing) {
        e.preventDefault();
        cutSelectedLayer();
        return;
      }
      if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        if (selectedLayer()) {
          e.preventDefault();
          deleteSelectedLayer();
        }
        return;
      }
      if (typing || modifier) return;
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) setTool(t.k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layers, view, selLayer]);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("svg")) return;
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY });
    };
    const closeMenu = () => setMenu(null);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", closeMenu);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!contextMenuHostRef.current) {
      const host = document.createElement("div");
      host.setAttribute("data-moldecore-context-menu", "true");
      document.body.appendChild(host);
      contextMenuHostRef.current = host;
      contextMenuRootRef.current = createRoot(host);
    }
    contextMenuRootRef.current?.render(
      menu ? (
        <CanvasContextMenu
          x={menu.x}
          y={menu.y}
          disabled={!selectedLayer()}
          onCut={cutSelectedLayer}
          onCopy={copySelectedLayer}
          onPaste={pasteLayer}
          onDelete={deleteSelectedLayer}
          onBringForward={() => moveSelectedLayer("front")}
          onSendBackward={() => moveSelectedLayer("back")}
          onPowerClip={() => {
            setPcEdit(true);
            setMenu(null);
          }}
        />
      ) : null,
    );
  }, [menu, layers, view, selLayer]);

  // Carregar do armazenamento local
  useEffect(() => {
    try {
      const g = localStorage.getItem(LS_GRADING);
      if (g) {
        const saved = JSON.parse(g) as Partial<Grading> | null;
        const merged = { ...DEFAULT_TABLE } as Grading;
        if (saved && typeof saved === "object") {
          for (const s of SIZES) {
            const row = (saved as Record<string, unknown>)[s];
            if (row && typeof row === "object") merged[s] = { ...DEFAULT_TABLE[s], ...(row as object) };
          }
        }
        setTable(merged);
      }
      const mm = localStorage.getItem(LS_MOTHER) as Size | null;
      if (mm && SIZES.includes(mm)) setMother(mm);
      const a = localStorage.getItem(LS_ART);
      if (a) setArtworks({ ...NO_ART, ...JSON.parse(a) });
      const st = localStorage.getItem(LS_STYLES);
      if (st) setStyles({ ...DEFAULT_STYLES, ...JSON.parse(st) });
      const s = localStorage.getItem(LS_SHAPES);
      if (s) setShapes({ ...DEFAULT_SHAPES, ...JSON.parse(s) });
      const ly = localStorage.getItem(LS_LAYERS);
      if (ly) setLayers({ ...NO_LAYERS, ...JSON.parse(ly) });
    } catch {
      /* ignora dados corrompidos */
    }
  }, []);

  /* ---------- Histórico (Desfazer / Refazer) ---------- */
  type Snap = { table: Grading; shapes: Shapes; artworks: Artworks; styles: Styles; layers: Layers };
  const snapRef = useRef<Snap>({ table, shapes, artworks, styles, layers });
  snapRef.current = { table, shapes, artworks, styles, layers };
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const lastCp = useRef({ key: "", t: 0 });

  const checkpoint = (key: string) => {
    const now = Date.now();
    if (lastCp.current.key === key && now - lastCp.current.t < 700) {
      lastCp.current.t = now;
      return;
    }
    lastCp.current = { key, t: now };
    const snap = snapRef.current;
    setPast((p) => [...p.slice(-99), snap]);
    setFuture([]);
  };

  const restore = (sn: Snap) => {
    setTable(sn.table);
    setShapes(sn.shapes);
    setArtworks(sn.artworks);
    setStyles(sn.styles);
    setLayers(sn.layers);
    localStorage.setItem(LS_GRADING, JSON.stringify(sn.table));
    localStorage.setItem(LS_SHAPES, JSON.stringify(sn.shapes));
    localStorage.setItem(LS_STYLES, JSON.stringify(sn.styles));
    saveLS(LS_ART, sn.artworks);
    saveLS(LS_LAYERS, sn.layers);
    lastCp.current = { key: "", t: 0 };
  };

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    const cur = snapRef.current;
    setPast(past.slice(0, -1));
    setFuture((f) => [cur, ...f]);
    restore(prev);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0]!;
    const cur = snapRef.current;
    setFuture(future.slice(1));
    setPast((p) => [...p, cur]);
    restore(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const updateShapes = (next: Shapes) => {
    checkpoint("shapes");
    setShapes(next);
    localStorage.setItem(LS_SHAPES, JSON.stringify(next));
  };

  /* Alimenta o desenho técnico do canvas com a vista ativa (a Costas tem buffer maior na barra). */
  activeView.current = view;

  const graded = table;

  useEffect(() => {
    const storedProfiles = readGradeProfiles();
    const storedActive = localStorage.getItem(LS_ACTIVE_PROFILE) ?? DEFAULT_PROFILE_NAME;
    const selected = storedProfiles.find((profile) => profile.name === storedActive) ?? storedProfiles[0]!;
    setProfiles(storedProfiles);
    setActiveProfile(selected.name);
    setTable(cloneGrading(selected.tables[clothingType] ?? DEFAULT_TABLE));
  }, []);

  useEffect(() => {
    if (!profileHostRef.current) {
      const host = document.createElement("div");
      host.setAttribute("data-moldecore-profile-dock", "true");
      document.body.appendChild(host);
      profileHostRef.current = host;
      profileRootRef.current = createRoot(host);
    }
    profileRootRef.current?.render(
      <ProfileDock
        profiles={profiles}
        activeProfile={activeProfile}
        onSelect={(name) => {
          const selected = profiles.find((profile) => profile.name === name);
          if (!selected) return;
          setActiveProfile(name);
          localStorage.setItem(LS_ACTIVE_PROFILE, name);
          setTable(cloneGrading(selected.tables[clothingType] ?? DEFAULT_TABLE));
          setSavedMsg(`Perfil ${name} carregado`);
          setTimeout(() => setSavedMsg(""), 2500);
        }}
        onCreate={() => {
          const name = window.prompt("Nome do Perfil do Cliente (ex: Grade do Paulo)");
          const normalized = name?.trim();
          if (!normalized || profiles.some((profile) => profile.name.toLowerCase() === normalized.toLowerCase())) return;
          const nextProfile = { name: normalized, tables: defaultTablesForProfiles() };
          const nextProfiles = [...profiles, nextProfile];
          setProfiles(nextProfiles);
          setActiveProfile(normalized);
          setTable(cloneGrading(nextProfile.tables[clothingType]));
          saveGradeProfiles(nextProfiles);
          localStorage.setItem(LS_ACTIVE_PROFILE, normalized);
        }}
        onDelete={() => {
          if (profiles.length <= 1 || activeProfile === DEFAULT_PROFILE_NAME) return;
          if (!window.confirm(`Excluir o perfil ${activeProfile}?`)) return;
          const nextProfiles = profiles.filter((profile) => profile.name !== activeProfile);
          const nextActive = nextProfiles[0]!;
          setProfiles(nextProfiles);
          setActiveProfile(nextActive.name);
          setTable(cloneGrading(nextActive.tables[clothingType]));
          saveGradeProfiles(nextProfiles);
          localStorage.setItem(LS_ACTIVE_PROFILE, nextActive.name);
        }}
      />,
    );
    return () => {
      profileRootRef.current?.unmount();
      profileRootRef.current = null;
      profileHostRef.current?.remove();
      profileHostRef.current = null;
    };
  }, [profiles, activeProfile, clothingType]);

  const updateTable = (sz: Size, key: Field, v: number) => {
    checkpoint(`table:${sz}:${key}`);
    setTable((t) => {
      const next = { ...t, [sz]: { ...t[sz], [key]: v } };
      setProfiles((currentProfiles) => {
        const nextProfiles = currentProfiles.map((profile) =>
          profile.name === activeProfile
            ? { ...profile, tables: { ...profile.tables, [clothingType]: cloneGrading(next) } }
            : profile,
        );
        saveGradeProfiles(nextProfiles);
        return nextProfiles;
      });
      localStorage.setItem(LS_GRADING, JSON.stringify(next));
      return next;
    });
  };

  const changeMother = (m: Size) => {
    setMother(m);
    setSize(m);
    localStorage.setItem(LS_MOTHER, m);
  };

  const updateArtworks = (next: Artworks) => {
    checkpoint("art");
    setArtworks(next);
    try {
      localStorage.setItem(LS_ART, JSON.stringify(next));
    } catch {
      /* imagem grande demais para o armazenamento local */
    }
  };

  const saveGrading = () => {
    const nextProfiles = profiles.map((profile) =>
      profile.name === activeProfile
        ? { ...profile, tables: { ...profile.tables, [clothingType]: cloneGrading(table) } }
        : profile,
    );
    setProfiles(nextProfiles);
    saveGradeProfiles(nextProfiles);
    localStorage.setItem(LS_GRADING, JSON.stringify(table));
    localStorage.setItem(LS_ACTIVE_PROFILE, activeProfile);
    setSavedMsg(`Perfil ${activeProfile} salvo neste navegador`);
    setTimeout(() => setSavedMsg(""), 2500);
  };

  /* Troca o tipo de peça usando a mesma configuração da barra de tamanhos.
     Ao entrar na grade infantil, o molde mãe e o tamanho selecionado ficam em 6ANOS. */
  const changeClothingType = (t: ClothingType) => {
    setClothingType(t);
    const selectedProfile = profiles.find((profile) => profile.name === activeProfile);
    const profileTable = selectedProfile?.tables[t];
    const preset = profileTable ?? PRESET_TABLES[t];
    if (!preset) return;
    checkpoint("tipoPeca:" + t);
    const availableIds = sizeIdsForGarment(t);
    const defaultMother = DEFAULT_MOTHER[t];
    const nextSize = availableIds.includes(size) ? size : defaultMother;
    const nextMother = availableIds.includes(defaultMother) ? defaultMother : availableIds[0]!;
    setTable(preset);
    localStorage.setItem(LS_GRADING, JSON.stringify(preset));
    setMother(nextMother);
    setSize(nextSize);
    localStorage.setItem(LS_MOTHER, nextMother);
    setSavedMsg(`Tabela de medidas de ${t} carregada · Molde Mãe: ${sizeLabel(t, nextMother)}`);
    setTimeout(() => setSavedMsg(""), 3500);
  };

  const artView: View = view;
  const art = artworks[view];

  useEffect(() => {
    setPcEdit(false);
    setSelLayer(null);
  }, [view]);

  /* ---------- Camadas / Objetos importados ---------- */
  const curLayers = layers[view];
  const updateLayers = (next: Layers, key = "layers") => {
    checkpoint(key);
    setLayers(next);
    saveLS(LS_LAYERS, next);
  };
  const setViewLayers = (arr: Layer[], key?: string) => updateLayers({ ...snapRef.current.layers, [view]: arr }, key);
  const selObj = curLayers.find((l) => l.id === selLayer) ?? null;

  const flash = (m: string) => {
    setImportMsg(m);
    setTimeout(() => setImportMsg(""), 3500);
  };

  const onImport = async (file: File, dropPosition?: { x: number; y: number }) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const id = crypto.randomUUID();
    const position = dropPosition ?? { x: 0.5, y: 0.4 };
    const base = {
      id,
      name: file.name,
      cx: Math.max(0, Math.min(1, position.x)),
      cy: Math.max(0, Math.min(1, position.y)),
      w: 0.4,
      rot: 0,
    };
    const add = (l: Layer) => {
      setViewLayers([...snapRef.current.layers[view], l], "import:" + id);
      setSelLayer(id);
      setSize(mother);
      setTool("selecao");
      flash(`${file.name} importado`);
    };
    try {
      setImportMsg("Importando " + file.name + "…");
      if (ext === "svg") {
        const r = importSvg(await file.text());
        if (r) add({ ...base, kind: "vetor", paths: r.paths, ratio: r.ratio });
        else {
          const src = await readDataUrl(file);
          add({ ...base, kind: "imagem", src, ratio: await imageRatio(src) });
        }
      } else if (ext === "pdf") {
        const r = await pdfToImage(file);
        add({ ...base, kind: "pdf", src: r.src, ratio: r.ratio });
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const src = await readDataUrl(file);
        add({ ...base, kind: "imagem", src, ratio: await imageRatio(src) });
      } else flash("Formato não suportado — use PDF, SVG, PNG ou JPEG");
    } catch {
      flash("Não foi possível ler " + file.name);
    }
  };

  useEffect(() => {
    const canvasSvgAt = (event: DragEvent): SVGSVGElement | null => {
      const candidates: Element[] = [];
      if (event.target instanceof Element) {
        const svg = event.target.closest("svg");
        if (svg) candidates.push(svg);
      }
      if (event.clientX >= 0 && event.clientY >= 0) {
        candidates.push(...document.elementsFromPoint(event.clientX, event.clientY));
      }
      return (
        candidates.find((element): element is SVGSVGElement => {
          if (!(element instanceof SVGSVGElement)) return false;
          const rect = element.getBoundingClientRect();
          return rect.width >= 300 && rect.height >= 200;
        }) ?? null
      );
    };

    const onCanvasDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      if (!canvasSvgAt(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };

    const onCanvasDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      const svg = canvasSvgAt(event);
      if (!svg) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const position = {
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
      };
      Array.from(event.dataTransfer.files).forEach((file) => {
        void onImport(file, position);
      });
    };

    window.addEventListener("dragover", onCanvasDragOver, true);
    window.addEventListener("drop", onCanvasDrop, true);
    return () => {
      window.removeEventListener("dragover", onCanvasDragOver, true);
      window.removeEventListener("drop", onCanvasDrop, true);
    };
  }, [onImport]);

  const reorder = (id: string, dir: "front" | "back" | "up" | "down") => {
    const arr = [...curLayers];
    const i = arr.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [l] = arr.splice(i, 1);
    const j = dir === "front" ? arr.length : dir === "back" ? 0 : dir === "up" ? Math.min(arr.length, i + 1) : Math.max(0, i - 1);
    arr.splice(j, 0, l!);
    setViewLayers(arr, "order:" + Date.now());
  };
  const deleteLayer = (id: string) => {
    setViewLayers(curLayers.filter((l) => l.id !== id), "del:" + Date.now());
    if (selLayer === id) setSelLayer(null);
  };
  const toggleHidden = (id: string) =>
    setViewLayers(curLayers.map((l) => (l.id === id ? { ...l, hidden: !l.hidden } : l)), "hide:" + Date.now());

  const layerToPowerClip = (id: string) => {
    const l = curLayers.find((x) => x.id === id);
    if (!l) return;
    const src = l.kind === "vetor" ? vectorDataUrl(l) : l.src!;
    const rest = curLayers.filter((x) => x.id !== id);
    if (art)
      rest.unshift({ id: crypto.randomUUID(), name: "Estampa anterior", kind: "imagem", src: art.src, cx: art.cx, cy: art.cy, w: art.w, ratio: art.ratio, rot: art.rot ?? 0 });
    checkpoint("pc-layer:" + Date.now());
    const nl = { ...layers, [view]: rest };
    const na = { ...artworks, [view]: { src, cx: l.cx, cy: l.cy, w: l.w, ratio: l.ratio, rot: l.rot, clipped: true } };
    setLayers(nl);
    setArtworks(na);
    saveLS(LS_LAYERS, nl);
    saveLS(LS_ART, na);
    setSelLayer(null);
    setSize(mother);
    setPcEdit(false);
  };

  const layerToOutline = (id: string) => {
    const l = curLayers.find((x) => x.id === id);
    if (!l?.paths) return;
    const subs = l.paths.flatMap((p) => p.subs);
    const sub = [...subs].sort((a, b) => Number(b.closed) - Number(a.closed) || b.nodes.length - a.nodes.length)[0];
    if (!sub || sub.nodes.length < 3) return;
    const m = table[mother];
    const isBody = view === "frente" || view === "costas";
    const W = isBody ? m.bodyWidth : m.sleeveWidth;
    const H = isBody ? m.bodyHeight : m.sleeveHeight;
    const aw = l.w * W;
    const ah = aw * l.ratio;
    const r = (l.rot * Math.PI) / 180;
    const cX = (l.cx - 0.5) * W;
    const cY = l.cy * H;
    const toPiece = (u: number, v: number) => {
      const lx = (u - 0.5) * aw;
      const ly = (v - 0.5) * ah;
      const X = cX + lx * Math.cos(r) - ly * Math.sin(r);
      const Y = cY + lx * Math.sin(r) + ly * Math.cos(r);
      return { x: X / W + 0.5, y: Y / H };
    };
    const nodes: Node[] = sub.nodes.map((q) => {
      const p = toPiece(q.x, q.y);
      const n: Node = { x: p.x, y: p.y, smooth: false };
      if (q.hIn) {
        const h = toPiece(q.x + q.hIn.x, q.y + q.hIn.y);
        n.hIn = { x: h.x - p.x, y: h.y - p.y };
      }
      if (q.hOut) {
        const h = toPiece(q.x + q.hOut.x, q.y + q.hOut.y);
        n.hOut = { x: h.x - p.x, y: h.y - p.y };
      }
      return n;
    });
    checkpoint("outline:" + Date.now());
    const ns = { ...shapes, [view]: nodes };
    const nl = { ...layers, [view]: curLayers.filter((x) => x.id !== id) };
    setShapes(ns);
    setLayers(nl);
    localStorage.setItem(LS_SHAPES, JSON.stringify(ns));
    saveLS(LS_LAYERS, nl);
    setSelLayer(null);
    setTool("forma");
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const applyColor = (t: ColorTarget, hex: string | null) => {
    checkpoint("color:" + Date.now());
    const next = { ...styles, [view]: { ...styles[view], [t === "contorno" ? "stroke" : "fill"]: hex } };
    setStyles(next);
    localStorage.setItem(LS_STYLES, JSON.stringify(next));
  };

  const setArt = (a: Artwork | null) => updateArtworks({ ...artworks, [view]: a });
  const pcApply = () => {
    if (art) setArt({ ...art, clipped: true });
    setPcEdit(false);
  };
  const pcEditStart = () => {
    setSize(mother);
    setTool("selecao");
    setPcEdit(true);
  };
  const pcExtract = () => {
    if (art) setArt({ ...art, clipped: false });
    setPcEdit(false);
  };
  const pcState = !art ? "none" : art.clipped === false ? "free" : pcEdit ? "editing" : "locked";

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        updateArtworks({
          ...artworks,
          [artView]: { src, cx: 0.5, cy: 0.35, w: 0.3, ratio: img.naturalHeight / img.naturalWidth, clipped: false },
        });
        setPcEdit(false);
        setSize(mother);
        setTool("selecao");
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const exportAll = () => {
    const isBody = view === "frente" || view === "costas";
    const st = styles[view];
    SIZES.forEach((sz, idx) => {
      const m = table[sz];
      const W = isBody ? m.bodyWidth : m.sleeveWidth;
      const H = isBody ? m.bodyHeight : m.sleeveHeight;
      const path = buildPath(shapes[view], W, H);
      let img = "";
      if (art) {
        const aw = art.w * W;
        const ah = aw * art.ratio;
        const x = (art.cx - 0.5) * W - aw / 2;
        const y = art.cy * H - ah / 2;
        const im = `<image href="${art.src}" x="${x}" y="${y}" width="${aw}" height="${ah}" transform="rotate(${art.rot ?? 0} ${x + aw / 2} ${y + ah / 2})" preserveAspectRatio="none"/>`;
        img = `<clipPath id="c"><path d="${path}"/></clipPath>${art.clipped === false ? im : `<g clip-path="url(#c)">${im}</g>`}`;
      }
      const objs = curLayers.map((l) => layerMarkup(l, W, H)).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2}cm" height="${H + 2}cm" viewBox="${-W / 2 - 1} -1 ${W + 2} ${H + 2}"><path d="${path}" fill="${st.fill ?? "none"}"/>${img}${objs}<path d="${path}" fill="none" stroke="${st.stroke ?? "#000"}" stroke-width="0.05"/></svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      setTimeout(() => {
        const el = document.createElement("a");
        el.href = url;
        el.download = `${exportName(clothingType, sz, view)}.svg`;
        el.click();
        URL.revokeObjectURL(url);
      }, idx * 250);
    });
  };

  /* ================= Exportação inteligente para Plotter ================= */


  const activeDims = () => {
    const isBody = view === "frente" || view === "costas";
    const mm = table[size];
    const W = isBody ? mm.bodyWidth : mm.sleeveWidth;
    const H = isBody ? mm.bodyHeight : mm.sleeveHeight;
    const pad = cropRect ? 0 : 6;
    return { W, H, pad, cmW: W + PLOTTER_MARGIN * 2 + pad * 2, cmH: H + PLOTTER_MARGIN * 2 + pad * 2 };
  };

  const buildPlotterSvg = (o: { hideTechnical: boolean; crop: boolean }) => {
    const isBody = view === "frente" || view === "costas";
    const mm = table[size];
    const W = isBody ? mm.bodyWidth : mm.sleeveWidth;
    const H = isBody ? mm.bodyHeight : mm.sleeveHeight;
    const st = styles[view];
    const path = buildPath(shapes[view], W, H);

    /* Contorno paralelo real: sangria e zona de segurança saem do MESMO traçado
       da Linha de Costura, deslocado na perpendicular de cada segmento e de cada
       curva (src/lib/vector-offset.ts) e com o canto resolvido pela bissetriz
       exata de cada nó. Nada de escalar largura/altura. */
    const bleedPath = offsetPathD(path, BLEED_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS);
    const safetyPath = offsetPathD(path, SAFETY_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS);
    const bleed = `<path d="${bleedPath}" fill="none" stroke="#38bdf8" stroke-width="0.06" stroke-linejoin="round"/>`;
    const seamLine = `<path d="${path}" fill="none" stroke="#111827" stroke-width="0.06" stroke-linejoin="round"/>`;
    const safety = `<path d="${safetyPath}" fill="none" stroke="#ef4444" stroke-width="0.06" stroke-dasharray="0.5 0.35" stroke-linejoin="round"/>`;
    const tech = o.hideTechnical ? "" : bleed + seamLine + safety;

    let img = "";
    if (art) {
      const aw = art.w * W;
      const ah = aw * art.ratio;
      const ax = (art.cx - 0.5) * W - aw / 2;
      const ay = art.cy * H - ah / 2;
      const im = `<image href="${art.src}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" transform="rotate(${art.rot ?? 0} ${ax + aw / 2} ${ay + ah / 2})" preserveAspectRatio="none"/>`;
      img = art.clipped === false ? im : `<g clip-path="url(#moldeClip)">${im}</g>`;
    }

    const objs = curLayers.map((l) => layerMarkup(l, W, H)).join("");
    const body = `<path d="${path}" fill="${st.fill ?? "none"}"/>`;
    const outline = o.hideTechnical
      ? ""
      : `<path d="${path}" fill="none" stroke="${st.stroke ?? "#111827"}" stroke-width="0.05"/>`;

    /* Quadro de mídia / Área de Mídia: o retângulo preto passa a coincidir
       EXATAMENTE com a Linha Azul de Sangria. Os limites (X_min, X_max, Y_min,
       Y_max) são lidos do próprio traçado da sangria — nada de margem, padding
       ou sobra cinza/branca em cima, embaixo ou nas laterais. */
    const bb =
      pathBounds(bleedPath) ?? {
        minX: -W / 2 - PLOTTER_MARGIN,
        minY: -PLOTTER_MARGIN,
        maxX: W / 2 + PLOTTER_MARGIN,
        maxY: H + PLOTTER_MARGIN,
      };
    const cmW = Math.max(0.1, bb.maxX - bb.minX);
    const cmH = Math.max(0.1, bb.maxY - bb.minY);
    const x0 = bb.minX;
    const y0 = bb.minY;

    const frame = `<rect x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" width="${cmW.toFixed(3)}" height="${cmH.toFixed(3)}" fill="none" stroke="#111827" stroke-width="0.1"/>`;
    /* Rótulo técnico fixo de produção: [Tamanho] [Parte] no canto superior
       esquerdo, por dentro da borda. Fica embutido no arquivo mesmo quando as
       linhas técnicas são escondidas. */
    const label = `<text x="${(x0 + 0.6).toFixed(2)}" y="${(y0 + 1.3).toFixed(2)}" font-family="monospace" font-size="1" fill="#111827">${techLabel(clothingType, size, view)}</text>`;

    /* A janela de exportação é recortada exatamente nos limites do quadro. */
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cmW.toFixed(3)}cm" height="${cmH.toFixed(3)}cm" viewBox="${x0.toFixed(3)} ${y0.toFixed(3)} ${cmW.toFixed(3)} ${cmH.toFixed(3)}">` +
      `<defs><clipPath id="moldeClip"><path d="${path}"/></clipPath></defs>` +
      body +
      img +
      objs +
      tech +
      outline +
      frame +
      label +
      `</svg>`;
    return { svg, cmW, cmH };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = filename;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const rasterizeSvg = (svg: string, pxW: number, pxH: number) =>
    new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.drawImage(img, 0, 0, pxW, pxH);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
      };
      img.onerror = () => reject(new Error("svg"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });

  const printVectorPdf = (svg: string, cmW: number, cmH: number, name: string) => {
    const win = window.open("", "_blank", "width=900,height=720");
    if (!win) {
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), name + ".svg");
      return false;
    }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>` +
        `<style>@page{size:${cmW}cm ${cmH}cm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${cmW}cm;height:${cmH}cm}</style>` +
        `</head><body>${svg}<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},400);});<\/script></body></html>`,
    );
    win.document.close();
    return true;
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const { svg, cmW, cmH } = buildPlotterSvg({ hideTechnical: hideTech, crop: cropRect });
      const base = `moldecore-plotter-${view}-${size}`;
      if (exportFmt === "pdf") {
        const ok = printVectorPdf(svg, cmW, cmH, base);
        setSavedMsg(
          ok
            ? "Arquivo 1:1 pronto — na janela de impressão escolha Salvar como PDF"
            : "Vetor 1:1 baixado como SVG",
        );
      } else {
        const px = (cm: number) => Math.round((cm / 2.54) * 300);
        const blob = await rasterizeSvg(svg, px(cmW), px(cmH));
        downloadBlob(blob, `${base}-300dpi.png`);
        setSavedMsg("PNG 300 DPI gerado no tamanho real");
      }
      setTimeout(() => setSavedMsg(""), 4500);
      setPlotterOpen(false);
    } catch {
      setSavedMsg("Não foi possível gerar o arquivo de exportação");
      setTimeout(() => setSavedMsg(""), 3500);
    } finally {
      setExporting(false);
    }
  };

  const techRows = [
    { key: "seam", label: "Linha de Costura", dot: "bg-ink", on: showSeam, toggle: () => setShowSeam((v) => !v) },
    { key: "bleed", label: "Margem de Sangria +1cm", dot: "bg-sky-400", on: showBleed, toggle: () => setShowBleed((v) => !v) },
    { key: "safety", label: "Zona de Segurança -4cm", dot: "bg-red-500", on: showSafety, toggle: () => setShowSafety((v) => !v) },
  ];

  const VIEWS: { key: View; label: string }[] = [
    { key: "frente", label: "Frente" },
    { key: "costas", label: "Costas" },
    { key: "mangaEsq", label: "Manga Esquerda" },
    { key: "mangaDir", label: "Manga Direita" },
  ];

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-display antialiased flex">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-64 shrink-0 bg-panel border-r border-line flex flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-cyan/10 border border-cyan/40 grid place-items-center shrink-0">
              <Shirt className="size-5 text-cyan" strokeWidth={2} />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-foreground leading-none">
                Molde<span className="text-cyan">Core</span>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-faint mt-1.5">
                Motor de Moldes
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 border-b border-line">
          <label className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Tipo de Peça
          </label>
          <div className="relative">
            <select
              value={clothingType}
              onChange={(e) => changeClothingType(e.target.value as ClothingType)}
              className="w-full appearance-none bg-panel2 border border-line rounded-md pl-3 pr-9 py-2.5 text-sm text-foreground font-medium focus:outline-none focus:border-cyan/60 cursor-pointer"
            >
              {NEW_CLOTHING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option>Camiseta</option>
              <option>Moletom</option>
              <option>Regata</option>
              <option>Manga Longa</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan size-4" />
          </div>
        </div>

        <div className="px-5 py-5">
          <button className="w-full flex items-center justify-center gap-2 bg-cyan text-primary-foreground font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors">
            <Plus className="size-4" strokeWidth={2.5} />
            Criar Novo Molde
          </button>
        </div>

        {/* ===== Camadas técnicas do canvas — olhos de visibilidade ===== */}
        <div className="px-5 pb-5 border-b border-line">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint mb-2">
            Camadas Técnicas
          </div>
          <div className="space-y-1">
            {techRows.map((row) => (
              <button
                key={row.key}
                onClick={row.toggle}
                aria-pressed={row.on}
                title={(row.on ? "Ocultar " : "Mostrar ") + row.label}
                className={
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-md border text-[11px] text-left transition-colors " +
                  (row.on
                    ? "border-cyan/30 bg-cyan/5 text-foreground"
                    : "border-line text-faint hover:text-foreground")
                }
              >
                <span className={"size-1.5 shrink-0 rounded-full " + row.dot} />
                <span className="flex-1 leading-tight">{row.label}</span>
                {row.on ? <Eye className="size-3.5 text-cyan" /> : <EyeOff className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* ===== Exportação para plotter ===== */}
        <div className="px-5 py-5 border-b border-line">
          <button
            onClick={() => setPlotterOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-panel2 border border-cyan/40 text-cyan font-semibold text-sm rounded-md py-3 hover:bg-cyan/10 transition-colors"
          >
            <Download className="size-4" strokeWidth={2.5} />
            Exportar para Plotter
          </button>
        </div>

        {plotterOpen && (
          <div
            className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPlotterOpen(false)}
          >
            <div
              className="w-full max-w-md bg-panel border border-line rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-12 px-4 border-b border-line flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Download className="size-4 text-cyan" />
                  Exportar para Plotter
                </span>
                <button
                  onClick={() => setPlotterOpen(false)}
                  aria-label="Fechar exportação"
                  className="text-muted-foreground hover:text-cyan"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint mb-2">
                    Formato do arquivo
                  </div>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setExportFmt("pdf")}
                      className={
                        "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md border text-xs text-left transition-colors " +
                        (exportFmt === "pdf"
                          ? "border-cyan/50 bg-cyan/10 text-cyan"
                          : "border-line text-muted-foreground hover:text-foreground")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 size-3 shrink-0 rounded-full border " +
                          (exportFmt === "pdf" ? "border-cyan bg-cyan" : "border-line")
                        }
                      />
                      <span className="flex-1 leading-snug">
                        PDF vetorial — escala real 1:1
                        <span className="block text-[10px] font-mono text-faint">
                          Vetor puro no tamanho exato do quadro de mídia
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => setExportFmt("png")}
                      className={
                        "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md border text-xs text-left transition-colors " +
                        (exportFmt === "png"
                          ? "border-cyan/50 bg-cyan/10 text-cyan"
                          : "border-line text-muted-foreground hover:text-foreground")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 size-3 shrink-0 rounded-full border " +
                          (exportFmt === "png" ? "border-cyan bg-cyan" : "border-line")
                        }
                      />
                      <span className="flex-1 leading-snug">
                        PNG — alta resolução 300 DPI
                        <span className="block text-[10px] font-mono text-faint">
                          Imagem raster no tamanho real para conferência
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint mb-2">
                    Opções de exportação
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideTech}
                        onChange={(e) => setHideTech(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-cyan"
                      />
                      <span className="text-xs text-foreground leading-snug">
                        Esconder Linhas Técnicas de Segurança
                        <span className="block text-[10px] font-mono text-faint">
                          Remove a sangria azul, a costura preta e a zona vermelha — sai só a estampa
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cropRect}
                        onChange={(e) => setCropRect(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-cyan"
                      />
                      <span className="text-xs text-foreground leading-snug">
                        Manter Apenas o Retângulo com a Estampa
                        <span className="block text-[10px] font-mono text-faint">
                          Recorta a saída exatamente na borda do quadro de mídia
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="rounded-md border border-line bg-panel2 p-2.5 text-[10px] font-mono text-muted-foreground leading-snug">
                  SAÍDA · {view.toUpperCase()} · TAMANHO {size} · {fmt(activeDims().cmW)} × {fmt(activeDims().cmH)} cm
                  {exportFmt === "png"
                    ? ` · ${Math.round((activeDims().cmW / 2.54) * 300)} × ${Math.round((activeDims().cmH / 2.54) * 300)} px`
                    : " · vetor 1:1"}
                </div>
              </div>

              <div className="px-4 py-3 border-t border-line flex gap-2">
                <button
                  onClick={() => setPlotterOpen(false)}
                  className="flex-1 py-2.5 rounded-md border border-line text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={runExport}
                  disabled={exporting}
                  className="flex-1 py-2.5 rounded-md bg-cyan text-primary-foreground text-sm font-semibold hover:bg-cyan/90 disabled:opacity-60"
                >
                  {exporting ? "Gerando…" : "Exportar"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-faint">
          Biblioteca
        </div>
        <nav className="px-3 pb-4 space-y-1">
          {LIBRARY.map((item) => (
            <a
              key={item.name}
              href="#"
              className={
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors " +
                (item.active
                  ? "bg-cyan/10 border border-cyan/25 text-cyan"
                  : "text-muted-foreground hover:bg-panel2 hover:text-foreground")
              }
            >
              <span className={"size-1.5 rounded-full " + (item.active ? "bg-cyan" : "bg-faint")} />
              <span className="flex-1">{item.name}</span>
              <span className={"text-[10px] font-mono " + (item.active ? "text-cyan" : "text-faint")}>
                {item.size}
              </span>
            </a>
          ))}
        </nav>

        <div className="mt-auto px-5 py-4 border-t border-line">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-panel2 border border-line grid place-items-center text-xs font-semibold text-cyan">
              AV
            </div>
            <div className="min-w-0">
              <div className="text-sm text-foreground truncate">Aria Vance</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-faint">Modelista</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ============ PRINCIPAL ============ */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-line bg-panel flex items-center justify-between px-6 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint">Área de Trabalho</span>
            <span className="text-faint">/</span>
            <span className="text-sm font-medium text-foreground truncate">{clothingType} — Sublimação</span>
          </div>
          <div className="flex items-center gap-3">
          <div className="flex items-center bg-panel2 border border-line rounded-md p-1">
            {(
              [
                ["Desfazer", Undo2, undo, past.length === 0, "Ctrl+Z"],
                ["Refazer", Redo2, redo, future.length === 0, "Ctrl+Y"],
              ] as const
            ).map(([label, Icon, run, disabled, kbd]) => (
              <button
                key={label}
                onClick={run}
                disabled={disabled}
                title={`${label} (${kbd})`}
                aria-label={label}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground hover:text-cyan hover:bg-cyan/10 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Icon className="size-3.5" /> <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-panel2 border border-line rounded-md p-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-faint px-2">Tamanho</span>
            {visibleSizeOptions.map((o) => (
              <button
                key={o.id}
                onClick={() => setSize(o.id)}
                className={
                  "px-2 py-1 rounded text-xs font-mono font-semibold transition-colors " +
                  (o.id === size ? "bg-cyan text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {o.label}
                {o.id === mother && <Crown className="inline size-2.5 ml-0.5 -mt-0.5" />}
              </button>
            ))}
          </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          <section className="flex-1 min-w-0 flex flex-col">
            {/* Abas de vista */}
            <div className="h-12 shrink-0 border-b border-line bg-panel flex items-center justify-between gap-3 px-4 overflow-x-auto">
              <div className="flex items-center gap-1">
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={
                      "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors border " +
                      (view === v.key
                        ? "bg-cyan/10 border-cyan/40 text-cyan"
                        : "border-transparent text-muted-foreground hover:text-foreground")
                    }
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
              {importMsg && <span className="text-[10px] font-mono text-amber whitespace-nowrap">{importMsg}</span>}
              <input
                ref={importRef}
                type="file"
                accept=".pdf,.svg,.png,.jpg,.jpeg,application/pdf,image/svg+xml,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImport(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap bg-cyan text-primary-foreground hover:bg-cyan/90"
              >
                <FileUp className="size-3.5" /> Importar
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border border-cyan/40 text-cyan hover:bg-cyan/10"
              >
                <ImagePlus className="size-3.5" /> Carregar Estampa
              </button>
              {art && (
                <>
                  <button
                    onClick={pcState === "free" ? pcApply : pcState === "locked" ? pcEditStart : pcApply}
                    className={
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border " +
                      (pcState === "editing" ? "border-amber/60 text-amber bg-amber/10" : "border-line text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Crop className="size-3.5" />
                    {pcState === "free" ? "Aplicar PowerClip" : pcState === "locked" ? "Editar Conteúdo do PowerClip" : "Concluir Edição"}
                  </button>
                  <button
                    onClick={() => setArt(null)}
                    aria-label="Remover estampa"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={exportAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border border-line text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" /> Exportar Tamanhos
              </button>
              <label className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                  className="accent-[var(--color-cyan)]"
                />
                Sobrepor
              </label>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex">
              <div className="w-12 shrink-0 bg-panel border-r border-line flex flex-col items-center py-2 gap-1 z-10">
                {TOOLS.map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTool(t.k)}
                    aria-label={t.label}
                    className={
                      "group relative size-9 grid place-items-center rounded-md border transition-colors " +
                      (tool === t.k
                        ? "bg-cyan/15 border-cyan/50 text-cyan"
                        : "border-transparent text-muted-foreground hover:bg-panel2 hover:text-foreground")
                    }
                  >
                    <t.icon className="size-4" />
                    <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-panel2 border border-line px-2 py-1 text-[11px] text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.label} <span className="font-mono text-faint ml-1">{t.key}</span>
                    </span>
                  </button>
                ))}
                <div className="mt-auto" />
                <button
                  onClick={() => setFitSignal((n) => n + 1)}
                  aria-label="Ajustar à tela"
                  className="group relative size-9 grid place-items-center rounded-md text-muted-foreground hover:bg-panel2 hover:text-foreground"
                >
                  <Maximize className="size-4" />
                  <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-panel2 border border-line px-2 py-1 text-[11px] text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    Ajustar à tela
                  </span>
                </button>
              </div>
              <div className="flex-1 min-w-0 relative bg-canvas blueprint-grid blueprint-grid-fine overflow-hidden">
                <PatternCanvas
                  clothingType={clothingType}
                  view={view}
                  size={size}
                  graded={graded}
                  overlay={overlay}
                  shapes={shapes}
                  onShapesChange={updateShapes}
                  tool={tool}
                  fitSignal={fitSignal}
                  artwork={art}
                  onArtworkChange={setArt}
                  mother={mother}
                  pcEdit={pcEdit}
                  partStyle={styles[view]}
                  onMenu={(x, y) => setMenu({ x, y })}
                  layers={curLayers}
                  selLayer={selLayer}
                  onSelLayer={setSelLayer}
                  onLayersChange={(arr) => setViewLayers(arr)}
                  showSeam={showSeam}
                  showBleed={showBleed}
                  showSafety={showSafety}
                />
                {/* Painel de camadas */}
                <div className="absolute top-3 right-3 w-60 rounded-md border border-line bg-panel shadow-lg text-xs z-10">
                  <button
                    onClick={() => setLayersOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 text-foreground"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <LayersIcon className="size-3.5 text-cyan" /> Camadas / Objetos
                    </span>
                    <span className="font-mono text-faint">{curLayers.length + (art ? 1 : 0)}</span>
                  </button>
                  {layersOpen && (
                    <div className="border-t border-line max-h-64 overflow-y-auto py-1">
                      {curLayers.length === 0 && !art && (
                        <div className="px-3 py-2 text-[11px] text-faint">Nenhum objeto. Use "Importar" para trazer PDF, SVG, PNG ou JPEG.</div>
                      )}
                      {[...curLayers].reverse().map((l) => {
                        const Icon = l.kind === "vetor" ? Spline : l.kind === "pdf" ? FileText : ImageIcon;
                        const sel = l.id === selLayer;
                        return (
                          <div
                            key={l.id}
                            onClick={() => {
                              setSelLayer(l.id);
                              if (tool !== "forma") setTool("selecao");
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelLayer(l.id);
                              setMenu({ x: e.clientX, y: e.clientY });
                            }}
                            className={
                              "group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer " +
                              (sel ? "bg-cyan/15 text-cyan" : "text-muted-foreground hover:bg-panel2 hover:text-foreground")
                            }
                          >
                            <Icon className="size-3.5 shrink-0" />
                            <span className={"flex-1 truncate " + (l.hidden ? "opacity-40" : "")} title={l.name}>
                              {l.name}
                            </span>
                            {(
                              [
                                [l.hidden ? EyeOff : Eye, l.hidden ? "Mostrar" : "Ocultar", () => toggleHidden(l.id)],
                                [ArrowUpToLine, "Trazer para Frente", () => reorder(l.id, "front")],
                                [ArrowDownToLine, "Enviar para Trás", () => reorder(l.id, "back")],
                                [Trash2, "Excluir", () => deleteLayer(l.id)],
                              ] as const
                            ).map(([I, label, run]) => (
                              <button
                                key={label}
                                aria-label={label}
                                title={label}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  run();
                                }}
                                className="p-0.5 rounded hover:text-foreground"
                              >
                                <I className="size-3" />
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {art && (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground border-t border-line/60">
                          <Crop className="size-3.5 shrink-0 text-cyan" />
                          <span className="flex-1 truncate">Estampa{art.clipped !== false ? " · PowerClip" : ""}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-4 text-[10px] font-mono text-faint pointer-events-none">
                  <span>{pcState === "editing" ? "Editando conteúdo do PowerClip · arraste a estampa e a alça do canto · clique em Concluir Edição para travar" : TOOL_HINTS[tool]}</span>
                  <button
                    onClick={() => updateShapes({ ...shapes, [view]: DEFAULT_SHAPES[view] })}
                    className="pointer-events-auto flex items-center gap-1 text-muted-foreground hover:text-cyan whitespace-nowrap"
                  >
                    <RotateCcw className="size-3" /> Restaurar forma
                  </button>
                </div>
              </div>
            </div>
          </section>

          <PaletteDock target={colorTarget} onTarget={setColorTarget} onApply={applyColor} current={styles[view]} />

          {menu && (
            <div
              className="fixed z-50 min-w-56 rounded-md border border-line bg-panel2 py-1 shadow-lg text-xs"
              style={{ left: menu.x, top: menu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {selObj && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-faint truncate">Objeto · {selObj.name}</div>
                  {[
                    { label: `Colocar no PowerClip do Molde Mãe (${mother})`, show: true, run: () => layerToPowerClip(selObj.id) },
                    { label: "Converter em contorno da peça", show: selObj.kind === "vetor", run: () => layerToOutline(selObj.id) },
                    { label: "Trazer para Frente", show: true, run: () => reorder(selObj.id, "front") },
                    { label: "Avançar uma posição", show: true, run: () => reorder(selObj.id, "up") },
                    { label: "Recuar uma posição", show: true, run: () => reorder(selObj.id, "down") },
                    { label: "Enviar para Trás", show: true, run: () => reorder(selObj.id, "back") },
                    { label: "Excluir objeto", show: true, run: () => deleteLayer(selObj.id) },
                  ]
                    .filter((i) => i.show)
                    .map((i) => (
                      <button
                        key={i.label}
                        onClick={() => {
                          i.run();
                          setMenu(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-foreground hover:bg-cyan/15 hover:text-cyan"
                      >
                        {i.label}
                      </button>
                    ))}
                  <div className="my-1 border-t border-line" />
                </>
              )}
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-faint">PowerClip</div>
              {[
                { label: `Aplicar PowerClip em ${VIEWS.find((v) => v.key === view)?.label}`, show: pcState === "free", run: pcApply },
                { label: "Editar Conteúdo do PowerClip", show: pcState === "locked", run: pcEditStart },
                { label: "Concluir Edição", show: pcState === "editing", run: pcApply },
                { label: "Extrair Conteúdo", show: pcState === "locked" || pcState === "editing", run: pcExtract },
                { label: "Carregar Estampa…", show: pcState === "none", run: () => fileRef.current?.click() },
                { label: "Importar Arquivo…", show: true, run: () => importRef.current?.click() },
                { label: "Remover Estampa", show: pcState !== "none", run: () => setArt(null) },
              ]
                .filter((i) => i.show)
                .map((i) => (
                  <button
                    key={i.label}
                    onClick={() => {
                      i.run();
                      setMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-foreground hover:bg-cyan/15 hover:text-cyan"
                  >
                    {i.label}
                  </button>
                ))}
            </div>
          )}

          {/* ============ PAINEL DIREITO ============ */}
          <aside className="w-80 shrink-0 bg-panel border-l border-line flex flex-col">
            <div className="grid grid-cols-2 border-b border-line">
              {(
                [
                  ["medidas", "Medidas", Ruler],
                  ["tabela", "Tabela de Tamanhos", Table2],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setPanel(k)}
                  className={
                    "flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors " +
                    (panel === k ? "border-cyan text-cyan" : "border-transparent text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>

            {panel === "medidas" ? (
              <>
                <div className="px-5 py-4 border-b border-line">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Dimensões do Molde Base</h2>
                    <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-cyan bg-cyan/10 border border-cyan/25 rounded px-1.5 py-0.5">
                      <Crown className="size-3" /> Molde Mãe
                      <select
                        value={mother}
                        onChange={(e) => changeMother(e.target.value as Size)}
                        className="bg-transparent text-cyan font-semibold focus:outline-none cursor-pointer"
                      >
                        {SIZES.map((s) => (
                          <option key={s} value={s} className="bg-panel">{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-[11px] text-faint mt-1 font-mono">Medidas do Tamanho {mother} · estampas são ancoradas aqui</p>
                </div>
                <div className="px-5 py-5 space-y-5 overflow-y-auto">
                  {["Corpo", "Manga"].map((group) => (
                    <div key={group} className="space-y-3">
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan">{group}</div>
                      {FIELDS.filter((f) => f.group === group).map((f) => (
                        <DimensionInput
                          key={f.key}
                          label={`${f.label} (cm)`}
                          value={table[mother][f.key]}
                          onChange={(v) => updateTable(mother, f.key, v)}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="pt-3 border-t border-line">
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
                      Tamanho {size} em exibição
                    </div>
                    {FIELDS.map((f) => (
                      <div key={f.key} className="flex justify-between text-[11px] font-mono py-0.5">
                        <span className="text-faint">{f.label}</span>
                        <span className="text-foreground">{fmt(graded[size][f.key])} cm</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-line mt-auto">
                  <button
                    onClick={() => setSize(mother)}
                    className="w-full flex items-center justify-center gap-2 bg-cyan text-primary-foreground font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
                  >
                    <Wand2 className="size-4" strokeWidth={2.5} />
                    Gerar Molde Base
                  </button>
                  <p className="text-[10px] font-mono text-faint text-center mt-2.5">
                    Graduação pela Tabela de Tamanhos · {SIZES.length} tamanhos
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-line">
                  <h2 className="text-sm font-semibold text-foreground">Configurar Tabela de Tamanhos</h2>
                  <p className="text-[11px] text-faint mt-1 font-mono">
                    Medidas finais de cada tamanho em cm · aplicadas na hora
                  </p>
                </div>
                <div className="px-3 py-4 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-faint">
                        <th className="text-left font-normal pb-2 pl-2 align-bottom">Tamanho</th>
                        <th className="font-normal pb-2 leading-tight">Altura do Corpo (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Largura do Corpo (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Altura da Manga (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Largura da Manga (cm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SIZES.map((s) => (
                        <tr key={s}>
                          <td className={"pl-2 font-semibold whitespace-nowrap " + (s === mother ? "text-cyan" : "text-foreground")}>
                            {s}
                            {s === mother && <Crown className="inline size-3 ml-1 -mt-0.5" />}
                          </td>
                          {FIELDS.map((f) => (
                            <td key={f.key} className="p-0.5">
                              <input
                                type="number"
                                step="0.5"
                                value={table[s][f.key]}
                                onChange={(e) => updateTable(s, f.key, parseFloat(e.target.value) || 0)}
                                className="w-full bg-panel2 border border-line rounded px-1.5 py-1.5 text-center text-foreground disabled:opacity-40 focus:outline-none focus:border-cyan/60"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-4 border-t border-line mt-auto space-y-2">
                  <button
                    onClick={saveGrading}
                    className="w-full flex items-center justify-center gap-2 bg-cyan text-primary-foreground font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
                  >
                    <Save className="size-4" /> Salvar Padrão
                  </button>
                  <button
                    onClick={() => {
                      checkpoint("table-reset:" + Date.now());
                      setTable(DEFAULT_TABLE);
                      localStorage.setItem(LS_GRADING, JSON.stringify(DEFAULT_TABLE));
                    }}
                    className="w-full text-[11px] font-mono text-muted-foreground hover:text-cyan"
                  >
                    Restaurar valores sugeridos
                  </button>
                  <p className="text-[10px] font-mono text-center text-cyan h-3">{savedMsg}</p>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ================= Canvas SVG ================= */

type Pt = { x: number; y: number };
type Drag =
  | { k: "node"; i: number }
  | { k: "hOut"; i: number }
  | { k: "hIn"; i: number }
  | { k: "pen"; i: number }
  | { k: "art"; start: Pt; orig: Artwork }
  | { k: "artScale"; orig: Artwork }
  | { k: "move"; start: Pt; orig: Node[] }
  | { k: "scale"; start: Pt; orig: Node[]; box: { x0: number; y0: number } }
  | { k: "pan"; sx: number; sy: number; orig: Pt; alt: boolean; at: Pt }
  | { k: "lmove"; start: Pt; orig: Layer }
  | { k: "lscale"; orig: Layer }
  | { k: "lrot"; orig: Layer }
  | { k: "lnode"; id: string; pi: number; si: number; i: number; which: "n" | "hIn" | "hOut" };

function PatternCanvas({
  view,
  size,
  graded,
  overlay,
  shapes,
  onShapesChange,
  tool,
  fitSignal,
  artwork,
  onArtworkChange,
  mother,
  pcEdit,
  partStyle,
  onMenu,
  layers,
  selLayer,
  onSelLayer,
  onLayersChange,
  showSeam = true,
  showBleed = true,
  showSafety = true,
  clothingType,
}: {
  clothingType: ClothingType;
  view: View;
  size: Size;
  graded: Record<Size, Measurements>;
  overlay: boolean;
  shapes: Shapes;
  onShapesChange: (s: Shapes) => void;
  tool: Tool;
  fitSignal: number;
  artwork: Artwork | null;
  onArtworkChange: (a: Artwork | null) => void;
  mother: Size;
  pcEdit: boolean;
  partStyle: PartStyle;
  onMenu: (x: number, y: number) => void;
  layers: Layer[];
  selLayer: string | null;
  onSelLayer: (id: string | null) => void;
  onLayersChange: (l: Layer[]) => void;
  showSeam?: boolean;
  showBleed?: boolean;
  showSafety?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Node[] | null>(null);
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 });
  const [tape, setTape] = useState<{ a: Pt | null; b: Pt | null }>({ a: null, b: null });
  const [hover, setHover] = useState<Pt | null>(null);

  const isBody = view === "frente" || view === "costas";
  const dims = (g: Measurements) =>
    isBody ? { w: g.bodyWidth, h: g.bodyHeight } : { w: g.sleeveWidth, h: g.sleeveHeight };
  const { w: W, h: H } = dims(graded[size]);
  const maxW = Math.max(...SIZES.map((s) => dims(graded[s]).w));
  const maxH = Math.max(...SIZES.map((s) => dims(graded[s]).h));
  const pad = Math.max(maxW, maxH) * 0.18;
  const bw = maxW + pad * 2;
  const bh = maxH + pad * 2;
  const bcx = 0;
  const bcy = maxH / 2;
  const vw = bw / zoom.k;
  const vh = bh / zoom.k;
  const vx = bcx + zoom.px - vw / 2;
  const vy = bcy + zoom.py - vh / 2;
  const unit = Math.max(maxW, maxH) / 60 / zoom.k;

  useEffect(() => setZoom({ k: 1, px: 0, py: 0 }), [fitSignal, view]);
  useEffect(() => {
    setDraft(null);
    setTape({ a: null, b: null });
  }, [tool, view]);

  const nodes = shapes[view];
  const setNodes = (next: Node[]) => onShapesChange({ ...shapes, [view]: next });
  const toSvg = (q: Pt): Pt => ({ x: (q.x - 0.5) * W, y: q.y * H });
  const toNorm = (p: Pt): Pt => ({ x: p.x / W + 0.5, y: p.y / H });
  const lg = (l: Layer) => {
    const aw = l.w * W;
    return { c: toSvg({ x: l.cx, y: l.cy }), aw, ah: aw * l.ratio };
  };
  const toLocal = (l: Layer, p: Pt) => {
    const { c, aw, ah } = lg(l);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const r = (-l.rot * Math.PI) / 180;
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    return { lx, ly, u: lx / aw + 0.5, v: ly / ah + 0.5 };
  };
  const setLayer = (l: Layer) => onLayersChange(layers.map((x) => (x.id === l.id ? l : x)));
  const selL = layers.find((l) => l.id === selLayer) ?? null;
  const layerNodeMode = tool === "forma" && selL?.kind === "vetor" && !selL.hidden;
  const svgPoint = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const capture = (e: React.PointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);

  const commitDraft = () => {
    if (draft && draft.length >= 3) setNodes(draft);
    setDraft(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tool !== "caneta" || !draft) return;
      if (e.key === "Enter") commitDraft();
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const box = {
    x0: Math.min(...nodes.map((n) => n.x)),
    y0: Math.min(...nodes.map((n) => n.y)),
    x1: Math.max(...nodes.map((n) => n.x)),
    y1: Math.max(...nodes.map((n) => n.y)),
  };

  const onBgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e);
    if ((tool === "selecao" || tool === "forma") && e.button === 0) onSelLayer(null);
    if (tool === "zoom") {
      capture(e);
      setDrag({ k: "pan", sx: e.clientX, sy: e.clientY, orig: { x: zoom.px, y: zoom.py }, alt: e.altKey, at: p });
    } else if (tool === "fita") {
      setTape((t) => (!t.a || t.b ? { a: p, b: null } : { a: t.a, b: p }));
    } else if (tool === "caneta") {
      if (draft && draft.length >= 3) {
        const f = toSvg(draft[0]!);
        if (Math.hypot(f.x - p.x, f.y - p.y) < unit * 1.5) {
          commitDraft();
          return;
        }
      }
      const n = toNorm(p);
      const next = [...(draft ?? []), { x: n.x, y: n.y, smooth: false }];
      setDraft(next);
      capture(e);
      setDrag({ k: "pen", i: next.length - 1 });
    }
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e);
    setHover(p);
    if (!drag) return;
    const n = toNorm(p);
    switch (drag.k) {
      case "art":
        onArtworkChange({ ...drag.orig, cx: drag.orig.cx + n.x - drag.start.x, cy: drag.orig.cy + n.y - drag.start.y });
        break;
      case "artScale":
        onArtworkChange({ ...drag.orig, w: Math.max(0.03, Math.abs(n.x - drag.orig.cx) * 2) });
        break;
      case "lmove":
        setLayer({ ...drag.orig, cx: drag.orig.cx + n.x - drag.start.x, cy: drag.orig.cy + n.y - drag.start.y });
        break;
      case "lscale": {
        const { lx } = toLocal(drag.orig, p);
        setLayer({ ...drag.orig, w: Math.max(0.02, (2 * Math.abs(lx)) / W) });
        break;
      }
      case "lrot": {
        const { c } = lg(drag.orig);
        let a = (Math.atan2(p.x - c.x, -(p.y - c.y)) * 180) / Math.PI;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        setLayer({ ...drag.orig, rot: Math.round(a * 10) / 10 });
        break;
      }
      case "lnode": {
        const l = layers.find((x) => x.id === drag.id);
        if (!l?.paths) break;
        const { u, v } = toLocal(l, p);
        const paths = l.paths.map((pp, pi) =>
          pi !== drag.pi
            ? pp
            : {
                ...pp,
                subs: pp.subs.map((s, si) =>
                  si !== drag.si
                    ? s
                    : {
                        ...s,
                        nodes: s.nodes.map((q, i) => {
                          if (i !== drag.i) return q;
                          if (drag.which === "n") return { ...q, x: u, y: v };
                          return { ...q, [drag.which]: { x: u - q.x, y: v - q.y } };
                        }),
                      },
                ),
              },
        );
        setLayer({ ...l, paths });
        break;
      }
      case "node":
        setNodes(nodes.map((q, i) => (i === drag.i ? { ...q, x: n.x, y: n.y } : q)));
        break;
      case "hOut":
      case "hIn":
        setNodes(
          nodes.map((q, i) => {
            if (i !== drag.i) return q;
            const o = { x: n.x - q.x, y: n.y - q.y };
            const m = { x: -o.x, y: -o.y };
            return drag.k === "hOut" ? { ...q, hOut: o, hIn: m } : { ...q, hIn: o, hOut: m };
          }),
        );
        break;
      case "pen":
        if (!draft) break;
        setDraft(
          draft.map((q, i) => {
            if (i !== drag.i) return q;
            const o = { x: n.x - q.x, y: n.y - q.y };
            if (Math.hypot(o.x * W, o.y * H) < 0.3) return q;
            return { ...q, smooth: true, hOut: o, hIn: { x: -o.x, y: -o.y } };
          }),
        );
        break;
      case "move": {
        const dx = n.x - drag.start.x;
        const dy = n.y - drag.start.y;
        setNodes(drag.orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })));
        break;
      }
      case "scale": {
        const b = drag.box;
        const sx = Math.max(0.05, (n.x - b.x0) / (drag.start.x - b.x0 || 1));
        const sy = Math.max(0.05, (n.y - b.y0) / (drag.start.y - b.y0 || 1));
        setNodes(
          drag.orig.map((q) => {
            const r: Node = { ...q, x: b.x0 + (q.x - b.x0) * sx, y: b.y0 + (q.y - b.y0) * sy };
            if (q.hIn) r.hIn = { x: q.hIn.x * sx, y: q.hIn.y * sy };
            if (q.hOut) r.hOut = { x: q.hOut.x * sx, y: q.hOut.y * sy };
            return r;
          }),
        );
        break;
      }
      case "pan": {
        const svg = svgRef.current!;
        const s = Math.max(vw / svg.clientWidth, vh / svg.clientHeight);
        setZoom((z) => ({
          ...z,
          px: drag.orig.x - (e.clientX - drag.sx) * s,
          py: drag.orig.y - (e.clientY - drag.sy) * s,
        }));
        break;
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (drag?.k === "pan" && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) {
      const f = drag.alt ? 1 / 1.6 : 1.6;
      const at = drag.at;
      setZoom((z) => ({ k: Math.min(12, Math.max(0.3, z.k * f)), px: at.x - bcx, py: at.y - bcy }));
    }
    setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = svgPoint(e);
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => {
      const k = Math.min(12, Math.max(0.3, z.k * f));
      const r = k / z.k;
      const cx = bcx + z.px;
      const cy = bcy + z.py;
      return { k, px: p.x + (cx - p.x) / r - bcx, py: p.y + (cy - p.y) / r - bcy };
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "forma" || layerNodeMode) return;
    const p = toNorm(svgPoint(e));
    let best = 0;
    let bestD = Infinity;
    nodes.forEach((a, i) => {
      const b = nodes[(i + 1) % nodes.length]!;
      const dd = ((a.x + b.x) / 2 - p.x) ** 2 + ((a.y + b.y) / 2 - p.y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    const next = [...nodes];
    next.splice(best + 1, 0, { ...p, smooth: true });
    setNodes(next);
  };

  const onNodeDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    if (tool === "forma") {
      if (e.altKey) {
        if (nodes.length > 3) setNodes(nodes.filter((_, j) => j !== i));
        return;
      }
      if (e.shiftKey) {
        setNodes(
          nodes.map((q, j) => {
            if (j !== i) return q;
            const { hIn: _a, hOut: _b, ...rest } = q;
            return { ...rest, smooth: !q.smooth };
          }),
        );
        return;
      }
    }
    capture(e);
    setDrag({ k: "node", i });
  };

  const others = overlay ? SIZES.filter((s) => s !== size) : [];
  const title = { frente: "FRENTE", costas: "COSTAS", mangaEsq: "MANGA ESQUERDA", mangaDir: "MANGA DIREITA" }[view];
  const showNodes = (tool === "forma" && !layerNodeMode) || tool === "caneta";
  const nodesInteractive = tool === "forma" || (tool === "caneta" && !draft);
  const cursor = { selecao: "cursor-default", forma: "cursor-crosshair", caneta: "cursor-crosshair", zoom: "cursor-zoom-in", fita: "cursor-crosshair" }[tool];
  const tapeEnd = tape.b ?? (tape.a ? hover : null);
  const sw = { strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };

  const square = (p: Pt, key: string | number, cls: string, onDown?: (e: React.PointerEvent) => void) => (
    <rect
      key={key}
      x={p.x - unit * 0.7}
      y={p.y - unit * 0.7}
      width={unit * 1.4}
      height={unit * 1.4}
      className={cls}
      {...sw}
      style={{ pointerEvents: onDown ? "auto" : "none" }}
      onPointerDown={onDown}
    />
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={"absolute inset-0 w-full h-full select-none touch-none " + cursor}
      onPointerDown={onBgDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <text x={-maxW / 2 - pad * 0.7} y={-pad * 0.5} fontSize={(Math.max(maxW, maxH) / 60) * 1.6} className="fill-faint font-mono">
        {title} · TAMANHO {size}
      </text>

      {others.map((s) => {
        const g = dims(graded[s]);
        return (
          <path
            key={s}
            d={buildPath(nodes, g.w, g.h)}
            className="fill-none stroke-faint pointer-events-none"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      <path
        d={buildPath(nodes, W, H)}
        className={"fill-garment stroke-cyan " + (tool === "selecao" ? "cursor-move" : "")}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        style={{
          pointerEvents: tool === "selecao" ? "all" : "none",
          ...(partStyle.fill ? { fill: partStyle.fill } : {}),
          ...(partStyle.stroke ? { stroke: partStyle.stroke } : {}),
        }}
        onPointerDown={(e) => {
          if (tool !== "selecao") return;
          e.stopPropagation();
          onSelLayer(null);
          capture(e);
          setDrag({ k: "move", start: toNorm(svgPoint(e)), orig: nodes });
        }}
      />

      {artwork && (() => {
        const aw = artwork.w * W;
        const ah = aw * artwork.ratio;
        const c = toSvg({ x: artwork.cx, y: artwork.cy });
        const clipped = artwork.clipped !== false;
        const editingNow = clipped && pcEdit && size === mother;
        const movable = size === mother && tool === "selecao" && (!clipped || editingNow);
        const imgProps = {
          href: artwork.src,
          x: c.x - aw / 2,
          y: c.y - ah / 2,
          width: aw,
          height: ah,
          preserveAspectRatio: "none",
          transform: `rotate(${artwork.rot ?? 0} ${c.x} ${c.y})`,
        };
        const down = (e: React.PointerEvent) => {
          e.stopPropagation();
          capture(e);
          setDrag({ k: "art", start: toNorm(svgPoint(e)), orig: artwork });
        };
        return (
          <g>
            <clipPath id="outline-clip">
              <path d={buildPath(nodes, W, H)} />
            </clipPath>
            {(!clipped || editingNow) && (
              <image
                {...imgProps}
                opacity={editingNow ? 0.3 : 1}
                className={movable ? "cursor-move" : ""}
                style={{ pointerEvents: movable ? "all" : "none" }}
                onPointerDown={movable ? down : undefined}
              />
            )}
            {clipped && (
              <g clipPath="url(#outline-clip)">
                <image {...imgProps} style={{ pointerEvents: "none" }} />
              </g>
            )}
            {movable && (
              <>
                <rect x={c.x - aw / 2} y={c.y - ah / 2} width={aw} height={ah} className="fill-none stroke-amber pointer-events-none" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                {square({ x: c.x + aw / 2, y: c.y + ah / 2 }, "artScale", "fill-amber stroke-amber cursor-nwse-resize", (e) => {
                  e.stopPropagation();
                  capture(e);
                  setDrag({ k: "artScale", orig: artwork });
                })}
              </>
            )}
            {(movable || !clipped) && (
              <text x={c.x} y={c.y - ah / 2 - unit} textAnchor="middle" fontSize={unit * 1.2} className="fill-amber font-mono pointer-events-none">
                {fmt(aw)} × {fmt(ah)} cm · {Math.round(artwork.w * 100)}% da largura{size !== mother ? ` · auto de ${mother}` : ""}
              </text>
            )}
          </g>
        );
      })()}

      {/* Objetos importados (camadas) */}
      {layers.map((l) => {
        if (l.hidden) return null;
        const { c, aw, ah } = lg(l);
        const sel = l.id === selLayer;
        const pickable = tool === "selecao" || tool === "forma";
        const down = (e: React.PointerEvent) => {
          if (!pickable) return;
          e.stopPropagation();
          onSelLayer(l.id);
          if (e.button !== 0 || tool !== "selecao") return;
          capture(e);
          setDrag({ k: "lmove", start: toNorm(svgPoint(e)), orig: l });
        };
        return (
          <g key={l.id} transform={`translate(${c.x} ${c.y}) rotate(${l.rot})`}>
            <g
              className={tool === "selecao" ? "cursor-move" : ""}
              style={{ pointerEvents: pickable ? "all" : "none" }}
              onPointerDown={down}
            >
              {l.src ? (
                <image href={l.src} x={-aw / 2} y={-ah / 2} width={aw} height={ah} preserveAspectRatio="none" />
              ) : (
                <>
                  <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} fill="transparent" />
                  <g transform={`translate(0 ${-ah / 2})`}>
                    {l.paths!.map((p, pi) => (
                      <path key={pi} d={layerPathD(p, aw, ah)} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.sw * aw} fillRule={p.rule} />
                    ))}
                  </g>
                </>
              )}
            </g>
            {sel && (
              <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} className="fill-none stroke-amber pointer-events-none" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
            {sel && tool === "selecao" && (
              <>
                <line x1={0} y1={-ah / 2} x2={0} y2={-ah / 2 - unit * 3} className="stroke-amber pointer-events-none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle
                  cx={0}
                  cy={-ah / 2 - unit * 3}
                  r={unit * 0.8}
                  className="fill-amber stroke-amber cursor-grab"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    capture(e);
                    setDrag({ k: "lrot", orig: l });
                  }}
                />
                {square({ x: aw / 2, y: ah / 2 }, "ls", "fill-amber stroke-amber cursor-nwse-resize", (e) => {
                  e.stopPropagation();
                  capture(e);
                  setDrag({ k: "lscale", orig: l });
                })}
                <text x={0} y={ah / 2 + unit * 2.2} textAnchor="middle" fontSize={unit * 1.1} className="fill-amber font-mono pointer-events-none">
                  {fmt(aw)} × {fmt(ah)} cm{l.rot ? ` · ${fmt(l.rot)}°` : ""}
                </text>
              </>
            )}
            {sel && layerNodeMode && l.paths && (
              <g>
                {l.paths.flatMap((pp, pi) =>
                  pp.subs.flatMap((s, si) =>
                    s.nodes.map((q, i) => {
                      const P = (x: number, y: number) => ({ x: (x - 0.5) * aw, y: (y - 0.5) * ah });
                      const pt = P(q.x, q.y);
                      const hs = (["hIn", "hOut"] as const).filter((k) => q[k]);
                      return (
                        <g key={`${pi}-${si}-${i}`}>
                          {hs.map((k) => {
                            const h = P(q.x + q[k]!.x, q.y + q[k]!.y);
                            return (
                              <g key={k}>
                                <line x1={pt.x} y1={pt.y} x2={h.x} y2={h.y} className="stroke-amber/70 pointer-events-none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                <circle
                                  cx={h.x}
                                  cy={h.y}
                                  r={unit * 0.5}
                                  className="fill-amber cursor-move"
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    capture(e);
                                    setDrag({ k: "lnode", id: l.id, pi, si, i, which: k });
                                  }}
                                />
                              </g>
                            );
                          })}
                          {square(pt, "n", "fill-garment stroke-cyan cursor-move", (e) => {
                            e.stopPropagation();
                            capture(e);
                            setDrag({ k: "lnode", id: l.id, pi, si, i, which: "n" });
                          })}
                        </g>
                      );
                    }),
                  ),
                )}
              </g>
            )}
          </g>
        );
      })}


      {/* Contorno sobre a estampa */}
      <path
        d={buildPath(nodes, W, H)}
        className="fill-none stroke-cyan pointer-events-none"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        style={partStyle.stroke ? { stroke: partStyle.stroke } : undefined}
      />

      {/* Mesma geometria vetorial do arquivo de produção, em centímetros reais. */}
      {(() => {
        const seam = buildPath(nodes, W, H);
        const bleed = offsetPathD(seam, BLEED_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS);
        const safety = offsetPathD(seam, SAFETY_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS);
        return (
          <g className="pointer-events-none">
            {showBleed && <path d={bleed} className="fill-none stroke-sky-400" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            {showSeam && (
              <path d={seam} className="fill-none stroke-ink" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            {showSafety && (
              <path d={safety} className="fill-none stroke-red-500" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        );
      })()}
      {artwork && artwork.clipped !== false && !pcEdit && (
        <text x={-W / 2} y={-unit * 1.5} fontSize={unit * 1.2} className="fill-cyan font-mono pointer-events-none">
          POWERCLIP · {size === mother ? "MOLDE MÃE" : `AUTO DE ${mother}`}
        </text>
      )}

      {/* Quadro de Mídia do Plotter — retângulo externo automático em volta do molde */}
      <g className="pointer-events-none">
        {(() => {
          /* Mesma caixa usada na exportação: limites absolutos da Linha Azul de
             Sangria, sem margem, para o quadro colar no contorno do molde. */
          const bb =
            pathBounds(offsetPathD(buildPath(nodes, W, H), BLEED_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS)) ?? {
              minX: -W / 2 - PLOTTER_MARGIN,
              minY: -PLOTTER_MARGIN,
              maxX: W / 2 + PLOTTER_MARGIN,
              maxY: H + PLOTTER_MARGIN,
            };
          const fx = bb.minX;
          const fy = bb.minY;
          const fw = Math.max(0.1, bb.maxX - bb.minX);
          const fh = Math.max(0.1, bb.maxY - bb.minY);
          return (
            <>
              <rect
                x={fx}
                y={fy}
                width={fw}
                height={fh}
                className="fill-none stroke-ink"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={fx + unit * 1.2}
                y={fy + unit * 2.2}
                fontSize={unit * 1.3}
                fontWeight="bold"
                className="fill-ink font-mono uppercase"
              >
                {techLabel(clothingType, size, view)} · QUADRO DE MÍDIA {fmt(fw)} × {fmt(fh)} cm
              </text>
            </>
          );
        })()}
      </g>

      {/* Cotas */}
      <g className="pointer-events-none">
        <line x1={-W / 2} x2={W / 2} y1={H + unit * 3} y2={H + unit * 3} className="stroke-amber" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={0} y={H + unit * 6} textAnchor="middle" fontSize={unit * 1.5} className="fill-amber font-mono">
          LARGURA {fmt(W)} cm
        </text>
        <line x1={W / 2 + unit * 3} x2={W / 2 + unit * 3} y1={0} y2={H} className="stroke-amber" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={W / 2 + unit * 5} y={H / 2} fontSize={unit * 1.5} className="fill-amber font-mono" transform={`rotate(90 ${W / 2 + unit * 5} ${H / 2})`} textAnchor="middle">
          ALTURA {fmt(H)} cm
        </text>
      </g>

      {/* Seleção: caixa + alça de escala */}
      {tool === "selecao" && !selLayer && (() => {
        const a = toSvg({ x: box.x0, y: box.y0 });
        const b = toSvg({ x: box.x1, y: box.y1 });
        return (
          <g>
            <rect x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} className="fill-none stroke-cyan/60 pointer-events-none" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {[a, { x: b.x, y: a.y }, { x: a.x, y: b.y }].map((p, i) => square(p, "c" + i, "fill-garment stroke-cyan/60"))}
            {square(b, "scale", "fill-cyan stroke-cyan cursor-nwse-resize", (e) => {
              e.stopPropagation();
              capture(e);
              setDrag({ k: "scale", start: toNorm(svgPoint(e)), orig: nodes, box: { x0: box.x0, y0: box.y0 } });
            })}
          </g>
        );
      })()}

      {/* Nós e alças */}
      {showNodes &&
        nodes.map((n, i) => {
          const p = toSvg(n);
          const handles = tool === "forma" ? ([["hIn", n.hIn], ["hOut", n.hOut]] as const) : [];
          return (
            <g key={i} style={{ opacity: draft ? 0.35 : 1 }}>
              {handles.map(([k, h]) => {
                if (!h) return null;
                const hp = toSvg({ x: n.x + h.x, y: n.y + h.y });
                return (
                  <g key={k}>
                    <line x1={p.x} y1={p.y} x2={hp.x} y2={hp.y} className="stroke-amber/70 pointer-events-none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <circle
                      cx={hp.x}
                      cy={hp.y}
                      r={unit * 0.6}
                      className="fill-amber stroke-amber cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        capture(e);
                        setDrag({ k, i });
                      }}
                    />
                  </g>
                );
              })}
              {square(
                p,
                "n",
                "stroke-cyan " + (nodesInteractive ? "cursor-move " : "") + (drag?.k === "node" && drag.i === i ? "fill-cyan" : n.smooth ? "fill-cyan/30" : "fill-garment"),
                nodesInteractive ? (e) => onNodeDown(e, i) : undefined,
              )}
            </g>
          );
        })}

      {/* Rascunho da caneta */}
      {draft && (
        <g className="pointer-events-none">
          <path d={buildPath(draft, W, H, false)} className="fill-none stroke-amber" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
          {hover && (() => {
            const l = toSvg(draft[draft.length - 1]!);
            return <line x1={l.x} y1={l.y} x2={hover.x} y2={hover.y} className="stroke-amber/40" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />;
          })()}
          {draft.map((n, i) => {
            const p = toSvg(n);
            return (
              <g key={i}>
                {n.hOut && n.hIn && (() => {
                  const o = toSvg({ x: n.x + n.hOut.x, y: n.y + n.hOut.y });
                  const m = toSvg({ x: n.x + n.hIn.x, y: n.y + n.hIn.y });
                  return <line x1={m.x} y1={m.y} x2={o.x} y2={o.y} className="stroke-amber/60" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                })()}
                {square(p, "d", i === 0 ? "fill-amber stroke-amber" : "fill-garment stroke-amber")}
              </g>
            );
          })}
        </g>
      )}

      {/* Fita métrica */}
      {tape.a && tapeEnd && (
        <g className="pointer-events-none">
          <line x1={tape.a.x} y1={tape.a.y} x2={tapeEnd.x} y2={tapeEnd.y} className="stroke-amber" strokeWidth={1.5} strokeDasharray={tape.b ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
          <circle cx={tape.a.x} cy={tape.a.y} r={unit * 0.5} className="fill-amber" />
          <circle cx={tapeEnd.x} cy={tapeEnd.y} r={unit * 0.5} className="fill-amber" />
          <rect
            x={(tape.a.x + tapeEnd.x) / 2 - unit * 5}
            y={(tape.a.y + tapeEnd.y) / 2 - unit * 3.2}
            width={unit * 10}
            height={unit * 2.4}
            rx={unit * 0.4}
            className="fill-panel stroke-amber/60"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={(tape.a.x + tapeEnd.x) / 2} y={(tape.a.y + tapeEnd.y) / 2 - unit * 1.5} textAnchor="middle" fontSize={unit * 1.4} className="fill-amber font-mono">
            {fmt(Math.hypot(tapeEnd.x - tape.a.x, tapeEnd.y - tape.a.y))} cm
          </text>
        </g>
      )}
    </svg>
  );
}

/* ================= Paleta de cores ================= */

const cmykToHex = (c: number, m: number, y: number, k: number) => {
  const ch = (v: number) =>
    Math.round(255 * (1 - v / 100) * (1 - k / 100))
      .toString(16)
      .padStart(2, "0");
  return ("#" + ch(c) + ch(m) + ch(y)).toUpperCase();
};

const RGB_PALETTE = [
  "#FFFFFF", "#E6E6E6", "#BFBFBF", "#808080", "#404040", "#000000",
  "#FF0000", "#FF5A00", "#FF9900", "#FFCC00", "#FFFF00", "#99FF00",
  "#00CC00", "#00FF99", "#00FFFF", "#0099FF", "#0033FF", "#6600FF",
  "#9900CC", "#FF00FF", "#FF3399", "#990033", "#663300", "#996633",
  "#003366", "#006666", "#336600", "#CC9966", "#FFCCCC", "#CCE5FF",
];

const CMYK_PALETTE: [number, number, number, number][] = [
  [0, 0, 0, 0], [0, 0, 0, 20], [0, 0, 0, 40], [0, 0, 0, 60], [0, 0, 0, 80], [0, 0, 0, 100],
  [0, 100, 100, 0], [0, 60, 100, 0], [0, 40, 100, 0], [0, 20, 100, 0], [0, 0, 100, 0], [40, 0, 100, 0],
  [100, 0, 100, 0], [100, 0, 60, 0], [100, 0, 0, 0], [100, 40, 0, 0], [100, 80, 0, 0], [100, 100, 0, 0],
  [60, 100, 0, 0], [0, 100, 0, 0], [0, 80, 20, 0], [0, 100, 60, 40], [0, 60, 100, 60], [100, 60, 0, 40],
  [100, 0, 40, 40], [60, 0, 100, 40], [0, 20, 40, 20], [0, 30, 10, 0], [20, 0, 0, 0], [0, 0, 20, 0],
];

type Swatch = { hex: string; label: string };

function PaletteDock({
  target,
  onTarget,
  onApply,
  current,
}: {
  target: ColorTarget;
  onTarget: (t: ColorTarget) => void;
  onApply: (t: ColorTarget, hex: string | null) => void;
  current: PartStyle;
}) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"rgb" | "cmyk">("cmyk");
  const [info, setInfo] = useState<Swatch | null>(null);
  const swatches: Swatch[] =
    mode === "rgb"
      ? RGB_PALETTE.map((hex) => ({ hex, label: hex }))
      : CMYK_PALETTE.map(([c, m, y, k]) => ({ hex: cmykToHex(c, m, y, k), label: `C:${c} M:${m} Y:${y} K:${k}` }));

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir paleta de cores"
        className="fixed right-0 top-0 z-50 flex h-screen w-10 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel pt-3 text-muted-foreground shadow-lg transition-colors hover:text-cyan"
      >
        <Palette className="size-4" />
        <span className="[writing-mode:vertical-rl] text-[10px] font-mono uppercase tracking-[0.2em]">Paleta</span>
      </button>
    );

  return (
    <div className="fixed right-0 top-0 z-50 flex h-screen w-14 shrink-0 flex-col border-l border-line bg-panel shadow-lg">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Palette className="size-3.5 text-cyan" />
        </span>
        <button onClick={() => setOpen(false)} aria-label="Recolher paleta" className="text-muted-foreground hover:text-cyan">
          <PanelRightClose className="size-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1.5">
        <div className="grid grid-cols-2 rounded-md border border-line bg-panel2 p-0.5 text-[9px] font-mono">
          {(["rgb", "cmyk"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={"py-1 rounded " + (mode === m ? "bg-cyan text-primary-foreground font-semibold" : "text-muted-foreground")}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {(
            [
              ["contorno", "Contorno"],
              ["preenchimento", "Preenchimento do Molde"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => onTarget(k)}
              className={
                "w-full flex items-center gap-2 px-2 py-1.5 rounded border text-[11px] text-left " +
                (target === k ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-line text-muted-foreground hover:text-foreground")
              }
            >
              <span
                className={"size-4 shrink-0 rounded-sm border border-line " + (k === "contorno" ? "border-2" : "")}
                style={
                  k === "contorno"
                    ? { borderColor: current.stroke ?? "var(--color-cyan)" }
                    : { background: current.fill ?? "transparent" }
                }
              />
              <span className="leading-tight">{label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1" onMouseLeave={() => setInfo(null)}>
          <button
            onClick={() => onApply(target, null)}
            onContextMenu={(e) => {
              e.preventDefault();
              onApply("contorno", null);
            }}
            onMouseEnter={() => setInfo({ hex: "", label: "Sem cor" })}
            aria-label="Sem cor"
            className="grid aspect-square place-items-center rounded-sm border border-line text-destructive hover:ring-1 hover:ring-cyan"
          >
            <X className="size-3" />
          </button>
          {swatches.map((s) => (
            <button
              key={s.label}
              onClick={() => onApply(target, s.hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                onApply("contorno", s.hex);
              }}
              onMouseEnter={() => setInfo(s)}
              aria-label={s.label}
              className="aspect-square min-h-5 min-w-5 rounded-sm border border-line transition-transform hover:scale-110 hover:ring-1 hover:ring-cyan"
              style={{ background: s.hex }}
            />
          ))}
        </div>

        <div className="rounded-md border border-line bg-panel2 p-2 min-h-[64px]">
          {info ? (
            <div className="flex items-start gap-2">
              <span className="size-8 shrink-0 rounded border border-line" style={{ background: info.hex || "transparent" }} />
              <div className="text-[10px] font-mono leading-snug min-w-0">
                <div className="text-foreground break-words">{info.label}</div>
                {mode === "cmyk" && info.hex && <div className="text-faint">{info.hex}</div>}
              </div>
            </div>
          ) : (
            <p className="text-[10px] font-mono text-faint leading-snug">
              Clique: aplica em {target === "contorno" ? "Contorno" : "Preenchimento"} · botão direito: Contorno
            </p>
          )}
        </div>
        {mode === "cmyk" && (
          <p className="text-[9px] font-mono text-faint leading-snug">Prévia de tela convertida de CMYK · confira a prova de impressão</p>
        )}
      </div>
    </div>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-panel2 border border-line rounded-md pl-3 pr-12 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-faint">cm</span>
      </div>
    </div>
  );
}
