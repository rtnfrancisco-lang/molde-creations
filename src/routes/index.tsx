import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Plus,
  Shirt,
  Wand2,
  Ruler,
  Table2,
  Save,
  RotateCcw,
  Users,
  Download,
  Crown,
  Trash2,
  Undo2,
  Redo2,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  LockOpen,
  ChevronRight,
  ChevronLeft,
  X,
  Crop,
  MousePointer2,
  Spline,
  PenTool,
  Shapes as ShapesIcon,
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
import { toast } from "sonner";
import * as idb from "@/lib/idb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TeamPanel, type TeamExportOpts } from "@/components/TeamPanel";
import { embedFonts } from "@/lib/raster-export";
import { sanitizeRoster, type Player } from "@/lib/roster";
import { teamScale, resolveTeamText, measureText, fontsReady, teamTextOverflows, type ResolvedTeamText } from "@/lib/team-text";
import { renderPiece, zipFiles, todayStamp, yieldFrame, MIME } from "@/lib/export-render";
import { teamFileName, uniqueName, TEAM_EXT, TEAM_DPIS, fitDpi, cmToPx, type TeamFormat } from "@/lib/team-export";
import { buildProjectFile, parseProjectFile, nameFromFile, PROJECT_EXT } from "@/lib/project-file";
import { hasFsAccess, pickSaveHandle, writeHandle, downloadText, openProjectFile, isAbort, type FileHandle } from "@/lib/file-access";
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
import { DirectTextEditor } from "@/components/DirectTextEditor";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { PowerClipEditor, artTransform, type PcArt } from "@/components/PowerClipEditor";
import { DrawOptionsPanel } from "@/components/DrawOptionsPanel";
import { DEFAULT_DRAW_OPTS, SHAPE_LABELS, dedupe, dragRect, layerFromCm, nextName, rdp, shapeNodes, type CmNode, type DrawOpts } from "@/lib/drawing";

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
type Artwork = PcArt;
type Artworks = Record<View, Artwork | null>;
type Layers = Record<View, Layer[]>;
const NO_LAYERS: Layers = { frente: [], costas: [], mangaEsq: [], mangaDir: [] };
type ColorTarget = "contorno" | "preenchimento";
type PartStyle = { stroke: string | null; fill: string | null };
type Styles = Record<View, PartStyle>;
const NO_ART: Artworks = { frente: null, costas: null, mangaEsq: null, mangaDir: null };
const NO_STYLE: PartStyle = { stroke: null, fill: null };
const DEFAULT_STYLES: Styles = { frente: NO_STYLE, costas: NO_STYLE, mangaEsq: NO_STYLE, mangaDir: NO_STYLE };
type Tool = "selecao" | "forma" | "caneta" | "formas" | "zoom" | "fita" | "texto";
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
  /** Campo do time: texto variável por jogador (opcional). */
  field?: "nome" | "numero";
  upper?: boolean;
  /** Largura máxima em cm, medida no tamanho do molde mãe. */
  fitWidth?: number | undefined;
  scaleWithSize?: boolean;
  /** Ponto fixo do campo do time. Ausente = "centro". */
  fieldAnchor?: "esquerda" | "centro" | "direita";
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
  { k: "formas", label: "Ferramenta Formas", icon: ShapesIcon, key: "U" },
  { k: "zoom", label: "Ferramenta Zoom", icon: ZoomIn, key: "Z" },
  { k: "fita", label: "Fita Métrica Digital", icon: Ruler, key: "M" },
  { k: "texto", label: "Ferramenta Texto", icon: Type, key: "T" },
];

const TOOL_HINTS: Record<Tool, string> = {
  selecao: "Clique em um objeto para selecionar · arraste as alças para redimensionar · o cadeado trava a proporção",
  forma: "Arraste nós e alças · duplo clique adiciona nó · Alt+clique remove · Shift+clique alterna reta/curva",
  caneta: "Mão livre: arraste para desenhar · clique para pontos retos · clique no 1º ponto, Enter ou duplo clique finaliza · Esc cancela",
  formas: "Escolha a forma · arraste no canvas · Shift proporcional · Alt a partir do centro",
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
const LS_SIDEBARS = "moldecore.barrasLaterais";
const LS_ACTIVE_PROFILE = "moldecore.perfilGradeAtivo";
const DEFAULT_PROFILE_NAME = "Padrão MoldeCore";

type ProfileTables = Record<ClothingType, Grading>;
type GradeProfile = {
  name: string;
  tables: ProfileTables;
  variations?: Record<string, string>;
};

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
  onSave,
}: {
  profiles: GradeProfile[];
  activeProfile: string;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onDelete: () => void;
  onSave?: (profileName: string, variationName: string) => void;
}) => {
  const [open, setOpen] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState(activeProfile);
  const [newProfileName, setNewProfileName] = useState("");
  const [variationName, setVariationName] = useState("");

  useEffect(() => {
    setSaveTarget(activeProfile);
  }, [activeProfile]);

  const submitSave = () => {
    const targetName = saveTarget === "__new__" ? newProfileName.trim() : saveTarget;
    if (!targetName) return;

    if (saveTarget === "__new__") {
      onCreate();
    }

    const nextProfiles = profiles.map((profile) => {
      if (profile.name !== targetName) return profile;
      return {
        ...profile,
        variations: {
          ...(profile.variations ?? {}),
          ...(variationName.trim() ? { [variationName.trim()]: new Date().toISOString() } : {}),
        },
      };
    });

    if (saveTarget !== "__new__") {
      saveGradeProfiles(nextProfiles);
      onSelect(targetName);
    }

    onSave?.(targetName, variationName.trim());
    window.dispatchEvent(
      new CustomEvent("moldecore:save-grade-profile", {
        detail: { profileName: targetName, variationName: variationName.trim() },
      }),
    );
    setSaveOpen(false);
    setNewProfileName("");
    setVariationName("");
  };

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
    <section className="relative flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-line bg-panel p-3 transition-all duration-200">
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

      <div className="flex items-center gap-2">
        <select
          value={activeProfile}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Perfil de Grade do Cliente"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-panel2 px-3 text-sm text-foreground outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
        >
          {profiles.map((profile) => (
            <option key={profile.name} value={profile.name}>
              {profile.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSaveTarget(activeProfile);
            setSaveOpen(true);
          }}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/10 px-3 text-sm font-medium text-cyan transition-colors hover:bg-cyan/20"
        >
          <Save className="size-4" />
          Salvar
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-faint">
        Cada perfil mantém tabelas independentes para peças adultas, infantis e Baby Look.
      </p>

      {saveOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm">
          <div className="w-full rounded-lg border border-line bg-panel p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-cyan">Salvar medidas</p>
                <h3 className="mt-1 text-base font-semibold text-foreground">Em qual Perfil de Cliente deseja salvar estas medidas?</h3>
              </div>
              <button type="button" onClick={() => setSaveOpen(false)} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">Perfil de destino</label>
            <select
              value={saveTarget}
              onChange={(event) => setSaveTarget(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-panel2 px-3 text-sm text-foreground outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
            >
              {profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>{profile.name} — atualizar</option>
              ))}
              <option value="__new__">Criar Novo Perfil</option>
            </select>

            {saveTarget === "__new__" && (
              <div className="mt-3">
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">Nome do Perfil Geral do Cliente</label>
                <input
                  autoFocus
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                  placeholder="Ex.: Grade do Paulo"
                  className="h-9 w-full rounded-md border border-input bg-panel2 px-3 text-sm text-foreground outline-none placeholder:text-faint focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
                />
              </div>
            )}

            <div className="mt-3">
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">Nome específico da variação (opcional)</label>
              <input
                value={variationName}
                onChange={(event) => setVariationName(event.target.value)}
                placeholder="Ex.: Grade inverno 2025"
                className="h-9 w-full rounded-md border border-input bg-panel2 px-3 text-sm text-foreground outline-none placeholder:text-faint focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveOpen(false)} className="h-9 rounded-md border border-line px-3 text-sm text-muted-foreground hover:bg-panel2 hover:text-foreground">Cancelar</button>
              <button type="button" onClick={submitSave} disabled={saveTarget === "__new__" && !newProfileName.trim()} className="h-9 rounded-md bg-cyan px-4 text-sm font-semibold text-primary-foreground hover:bg-cyan/90 disabled:opacity-50">Salvar perfil</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* ---------- Persistência: dados grandes no IndexedDB, preferências no localStorage ---------- */
const BIG_KEYS = new Set([
  "moldecore.camadas",
  "moldecore.estampas",
  "moldecore.textos",
  "moldecore.formas",
  "moldecore.cores",
  "moldecore.time",
]);
const SAVE_FAIL_TOAST = "moldecore-save-fail";
let saveFailed = false;
const reportSave = (ok: boolean) => {
  if (ok) {
    if (saveFailed) toast.dismiss(SAVE_FAIL_TOAST);
    saveFailed = false;
  } else if (!saveFailed) {
    saveFailed = true;
    toast.error("Não foi possível salvar automaticamente. Salve o projeto em arquivo (Arquivo > Salvar)", {
      id: SAVE_FAIL_TOAST,
      duration: Infinity,
    });
  }
};
/** Só grava dados grandes depois que o carregamento inicial terminou. */
let bigHydrated = false;
let useIdb = true;
const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const writeLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
const flushBig = async () => {
  flushTimer = null;
  const items = [...pending];
  pending.clear();
  let ok = true;
  for (const [k, v] of items) {
    if (useIdb) {
      try {
        await idb.set(k, v);
        continue;
      } catch {
        ok = false;
        continue;
      }
    }
    if (!writeLS(k, v)) ok = false;
  }
  reportSave(ok);
};
const saveLS = (k: string, v: unknown) => {
  if (BIG_KEYS.has(k)) {
    if (!bigHydrated) return;
    pending.set(k, v);
    if (!flushTimer) flushTimer = setTimeout(() => void flushBig(), 200);
    return;
  }
  if (!writeLS(k, v)) reportSave(false);
};
/** Lê uma chave grande; migra do localStorage para o IndexedDB quando preciso. */
const loadBig = async (k: string): Promise<unknown> => {
  const legacy = () => {
    const raw = localStorage.getItem(k);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  };
  if (!useIdb) return legacy();
  const v = await idb.get(k);
  if (v !== undefined) return v;
  const old = legacy();
  if (old === undefined) return undefined;
  try {
    await idb.set(k, old);
    if ((await idb.get(k)) !== undefined) localStorage.removeItem(k);
  } catch {
    /* mantém a chave antiga se a migração falhar */
  }
  return old;
};
/** Carrega todas as chaves grandes de uma vez e libera a gravação. */
let bigPromise: Promise<Record<string, unknown>> | null = null;
const getBig = () => (bigPromise ??= loadAllBig());
const loadAllBig = async (): Promise<Record<string, unknown>> => {
  useIdb = idb.hasIdb();
  if (useIdb) {
    try {
      await idb.keys();
    } catch {
      useIdb = false;
    }
  }
  const out: Record<string, unknown> = {};
  for (const k of BIG_KEYS) {
    try {
      out[k] = await loadBig(k);
    } catch {
      useIdb = false;
      out[k] = await loadBig(k).catch(() => undefined);
    }
  }
  return out;
};

const LIBRARY = [
  { name: "Camiseta Clássica — Sublimação", size: "M", active: true },
  { name: "Moletom Oversized", size: "G" },
  { name: "Regata Nadador", size: "P" },
  { name: "Gola Careca — Manga Longa", size: "GG" },
];

const fmt = (n: number) => n.toFixed(1).replace(".", ",");
const round1 = (n: number) => Math.round(n * 10) / 10;

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

type CtxItem = { label: string; run: () => void; disabled?: boolean };

/** "Digitando" = só campos de texto reais; color/range/checkbox/select não bloqueiam atalhos. */
const TYPING_INPUTS = new Set(["text", "number", "search", "email", "url", "tel", "password"]);
const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return TYPING_INPUTS.has(((el as HTMLInputElement).type || "text").toLowerCase());
  return false;
};

function CanvasContextMenu({
  x,
  y,
  disabled,
  deleteDisabled,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onBringForward,
  onSendBackward,
  sections,
  onClose,
}: {
  x: number;
  y: number;
  disabled: boolean;
  deleteDisabled: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  sections: { title: string; items: CtxItem[] }[];
  onClose: () => void;
}) {
  const itemClass =
    "flex w-full items-center justify-between gap-5 rounded px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40";
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="fixed z-[100] min-w-52 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-lg border border-line bg-panel p-1.5 shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.max(8, Math.min(y, window.innerHeight - 460)) }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className={itemClass} disabled={disabled} onClick={act(onCut)}>
        <span>Recortar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+X</span>
      </button>
      <button type="button" className={itemClass} disabled={disabled} onClick={act(onCopy)}>
        <span>Copiar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+C</span>
      </button>
      <button type="button" className={itemClass} onClick={act(onPaste)}>
        <span>Colar</span>
        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+V</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={itemClass} disabled={deleteDisabled} onClick={act(onDelete)}>
        <span>Excluir</span>
        <span className="font-mono text-[10px] text-muted-foreground">Delete</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={itemClass} disabled={disabled} onClick={act(onBringForward)}>
        <span>Trazer para Frente</span>
        <span className="font-mono text-[10px] text-muted-foreground">Camada</span>
      </button>
      <button type="button" className={itemClass} disabled={disabled} onClick={act(onSendBackward)}>
        <span>Enviar para Trás</span>
        <span className="font-mono text-[10px] text-muted-foreground">Camada</span>
      </button>
      {sections
        .filter((sec) => sec.items.length > 0)
        .map((sec) => (
          <div key={sec.title}>
            <div className="my-1 border-t border-line" />
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-faint">{sec.title}</div>
            {sec.items.map((i) => (
              <button key={i.label} type="button" className={itemClass} disabled={i.disabled} onClick={act(i.run)}>
                <span>{i.label}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

const LS_TEXTS = "moldecore.textos";
const LS_TEAM = "moldecore.time";
type TextsByView = Record<View, TextElement[]>;
const NO_TEXTS: TextsByView = { frente: [], costas: [], mangaEsq: [], mangaDir: [] };

const escXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* Textos para exportação: mesmo desenho do canvas (cm, x centrado em 0). */
type TextResolve = (t: TextElement) => ResolvedTeamText | null;
const textMarkup = (items: TextElement[], opts?: { resolve?: TextResolve }) =>
  items
    .map((t) => {
      if (!opts?.resolve) return t;
      const r = opts.resolve(t);
      if (!r) return null;
      const { left: _l, right: _r, ...rest } = r;
      return { ...t, ...rest, align: r.align ?? t.align };
    })
    .filter((t): t is TextElement => !!t && t.text.trim().length > 0)
    .map((t) => {
      const fs = t.fontSize / 10;
      const anchor = t.align === "left" ? "start" : t.align === "center" ? "middle" : "end";
      const spans = t.text
        .split("\n")
        .map((line, i) => `<tspan x="${t.x}" dy="${i ? fs * 1.15 : 0}">${escXml(line || " ")}</tspan>`)
        .join("");
      return `<text x="${t.x}" y="${t.y + fs}" font-size="${fs}" text-anchor="${anchor}" font-family="${escXml(t.fontFamily)}" font-weight="${t.bold ? 700 : 400}" font-style="${t.italic ? "italic" : "normal"}"${t.underline ? ' text-decoration="underline"' : ""} fill="${escXml(t.color)}" xml:space="preserve">${spans}</text>`;
    })
    .join("");

const TEXT_FONTS = ["Arial", "Impact", "Montserrat", "Bebas Neue", "Roboto", "Comic Sans MS"];

type TextWorkspaceProps = {
  tool: Tool;
  view: View;
  svgPoint: (event: { clientX: number; clientY: number }) => { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  texts: TextsByView;
  setTexts: (next: TextsByView) => void;
  checkpoint: (key: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  unit: number;
  selectionBox: (
    aw: number,
    ah: number,
    color: "amber" | "cyan",
    onHandle: (e: React.PointerEvent, hx: HandleDir, hy: HandleDir) => void,
    skip?: (hx: HandleDir, hy: HandleDir) => boolean,
  ) => React.ReactNode;
  /** Pré-visualização do time: textos já resolvidos, somente leitura. */
  preview?: TextElement[] | null;
};

type TBox = { x: number; y: number; w: number; h: number };

function TextWorkspace({ tool, view, svgPoint, bounds, texts: byView, setTexts, checkpoint, selectedId, onSelect: setSelectedId, unit, selectionBox, preview }: TextWorkspaceProps) {
  const selTextRef = useRef<SVGTextElement | null>(null);
  const [box, setBox] = useState<TBox | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [resize, setResize] = useState<{ id: string; px: number; py: number; d0: number; hx: HandleDir; hy: HandleDir; orig: TextElement } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTextValue, setActiveTextValue] = useState("");
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  // Espelho síncrono do estado do Index (atualizado a cada render e a cada mudança).
  const textsRef = useRef<TextsByView>(byView);
  textsRef.current = byView;
  const editingIdRef = useRef<string | null>(null);
  const editingViewRef = useRef<View>(view);
  const activeTextValueRef = useRef("");
  const previousToolRef = useRef<Tool>(tool);
  const texts = byView[view];
  const selected = texts.find((item) => item.id === selectedId) ?? null;
  // Painel de estilo encaixado no canto superior esquerdo da área do canvas.
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPanelHost(document.getElementById("text-panel-host"));
  }, []);

  const updateTexts = (target: View, updater: (items: TextElement[]) => TextElement[]) => {
    const next = { ...textsRef.current, [target]: updater(textsRef.current[target]) };
    textsRef.current = next;
    setTexts(next);
  };

  const commitText = (forId?: string, forValue?: string) => {
    const id = editingIdRef.current;
    if (!id || (forId && forId !== id)) return;
    const value = (forValue ?? activeTextValueRef.current).replace(/\u00a0/g, " ");
    // O texto pertence à vista em que foi criado, mesmo que a vista já tenha mudado.
    updateTexts(editingViewRef.current, (items) => items
      .map((item) => item.id === id ? { ...item, text: value } : item)
      .filter((item) => item.text.trim().length > 0));
    editingIdRef.current = null;
    setEditingId(null);
    if (!value.trim()) setSelectedId(null);
  };

  // Persist the active text before switching to the selection tool (or any other tool).
  useEffect(() => {
    if (previousToolRef.current === "texto" && tool !== "texto") commitText();
    previousToolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    commitText();
    setSelectedId(null);
  }, [view]);

  // Outras ferramentas (Caneta, Formas, Zoom, Fita, Forma) limpam a seleção do texto.
  useEffect(() => {
    if (tool !== "selecao" && tool !== "texto" && selectedId) setSelectedId(null);
  }, [tool]);

  useEffect(() => {
    document.fonts?.ready.then(() => setFontsTick((t) => t + 1));
  }, []);

  const [defaults, setDefaults] = useState<Omit<TextElement, "id" | "text" | "x" | "y">>({
    fontFamily: "Arial", fontSize: 24, bold: false, italic: false,
    underline: false, align: "left", color: "#20242b",
  });
  const current = selected ?? defaults;
  const shownText = (item: Pick<TextElement, "text" | "field" | "upper">) =>
    item.field === "nome" && item.upper ? item.text.toUpperCase() : item.text;

  // Caixas medidas dos textos com campo do time (selo visual, só na tela).
  const textEls = useRef<Record<string, SVGTextElement | null>>({});
  const [fieldBoxes, setFieldBoxes] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  useLayoutEffect(() => {
    const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const item of texts) {
      if (!item.field || item.id === editingId) continue;
      const el = textEls.current[item.id];
      if (!el) continue;
      try { const b = el.getBBox(); next[item.id] = { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { /* ignora */ }
    }
    setFieldBoxes((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  });

  const setField = (field: "fixo" | "nome" | "numero") => {
    const apply = (item: Omit<TextElement, "id" | "text" | "x" | "y"> | TextElement) => {
      const { field: _f, upper: _u, fitWidth: _w, scaleWithSize: _s, fieldAnchor: _a, ...rest } = item as TextElement;
      if (field === "fixo") return rest;
      return { ...rest, field, scaleWithSize: item.scaleWithSize ?? true,
        ...(field === "nome" ? { upper: item.upper ?? false, ...(item.fitWidth ? { fitWidth: item.fitWidth } : {}) } : {}) };
    };
    setDefaults((d) => apply(d) as typeof d);
    if (!selectedId) return;
    checkpoint("text-style:" + selectedId);
    updateTexts(view, (items) => items.map((item) => item.id === selectedId ? apply(item) as TextElement : item));
  };

  // Caixa do texto selecionado, medida no próprio SVG (unidades do canvas).
  useLayoutEffect(() => {
    const el = selTextRef.current;
    if (!selected || editingId === selected.id || !el) {
      setBox(null);
      return;
    }
    try {
      const b = el.getBBox();
      setBox({ x: b.x, y: b.y, w: b.width, h: b.height });
    } catch {
      setBox(null);
    }
  }, [selected?.text, selected?.fontSize, selected?.fontFamily, selected?.bold, selected?.italic, selected?.align, selected?.x, selected?.y, selected?.id, selected?.upper, selected?.field, view, editingId, fontsTick]);

  // Redimensionamento proporcional pelas alças, com o ponto oposto fixo.
  useEffect(() => {
    if (!resize) return;
    const move = (event: PointerEvent) => {
      const p = svgPoint(event);
      const { px, py, d0, hx, hy, orig } = resize;
      const d = hx !== 0 && hy !== 0 ? Math.max(Math.abs(p.x - px), Math.abs(p.y - py)) : hx !== 0 ? Math.abs(p.x - px) : Math.abs(p.y - py);
      const sRaw = d0 > 0 ? d / d0 : 1;
      const fs = Math.min(1000, Math.max(1, orig.fontSize * sRaw));
      const s = fs / orig.fontSize;
      updateTexts(view, (items) => items.map((item) => item.id === resize.id
        ? { ...item, fontSize: Math.round(fs * 100) / 100, x: px + s * (orig.x - px), y: py + s * (orig.y - py) } : item));
    };
    const stop = () => setResize(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
  }, [resize, view, svgPoint]);

  const startResize = (_e: React.PointerEvent, hx: HandleDir, hy: HandleDir) => {
    if (!selected || !box) return;
    // Ponto fixo: canto/lado oposto da caixa.
    const px = box.x + box.w / 2 - (hx * box.w) / 2;
    const py = box.y + box.h / 2 - (hy * box.h) / 2;
    const hxp = box.x + box.w / 2 + (hx * box.w) / 2;
    const hyp = box.y + box.h / 2 + (hy * box.h) / 2;
    const d0 = hx !== 0 && hy !== 0 ? Math.max(Math.abs(hxp - px), Math.abs(hyp - py)) : hx !== 0 ? Math.abs(hxp - px) : Math.abs(hyp - py);
    checkpoint("text-resize:" + Date.now());
    setResize({ id: selected.id, px, py, d0, hx, hy, orig: selected });
  };

  const updateSelected = (patch: Partial<TextElement>) => {
    // Sem texto selecionado, o estilo vale para o próximo texto criado.
    setDefaults((d) => ({ ...d, ...patch }));
    if (!selectedId) return;
    checkpoint("text-style:" + selectedId);
    updateTexts(view, (items) => items.map((item) => item.id === selectedId ? { ...item, ...patch } : item));
  };

  const startEditing = (item: TextElement) => {
    editingIdRef.current = item.id;
    editingViewRef.current = view;
    activeTextValueRef.current = item.text;
    setEditingId(item.id);
    setActiveTextValue(item.text);
    setSelectedId(item.id);
  };

  const addText = (event: React.PointerEvent<SVGRectElement>) => {
    if (tool !== "texto" || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    // Salva o texto em edição antes de abrir outro (o preventDefault impede o blur).
    commitText();
    const point = svgPoint(event);
    const item: TextElement = { id: crypto.randomUUID(), text: "", x: point.x, y: point.y, ...defaults };
    checkpoint("text-add:" + item.id);
    updateTexts(view, (items) => [...items, item]);
    startEditing(item);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const point = svgPoint(event);
      updateTexts(view, (items) => items.map((item) => item.id === drag.id
        ? { ...item, x: point.x - drag.dx, y: point.y - drag.dy } : item));
    };
    const stop = () => setDrag(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
  }, [drag, view, svgPoint]);

  // Delete/Backspace remove o texto selecionado (fora da edição e de campos).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!selectedId || editingIdRef.current) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = selectedId;
      checkpoint("text-del:" + Date.now());
      updateTexts(view, (items) => items.filter((item) => item.id !== id));
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selectedId, view]);

  if (preview) {
    return (
      <g data-text-workspace data-team-preview className="pointer-events-none">
        {preview.map((item) => {
          const fontSize = item.fontSize / 10;
          return (
            <text key={item.id} x={item.x} y={item.y + fontSize} fill={item.color}
              style={{ fontFamily: item.fontFamily, fontSize, fontWeight: item.bold ? 700 : 400, fontStyle: item.italic ? "italic" : "normal", textDecoration: item.underline ? "underline" : "none" }}
              textAnchor={item.align === "left" ? "start" : item.align === "center" ? "middle" : "end"}>
              {item.text.split("\n").map((line, index) => <tspan key={index} x={item.x} dy={index ? fontSize * 1.15 : 0}>{line || " "}</tspan>)}
            </text>
          );
        })}
      </g>
    );
  }

  return (
    <g data-text-workspace>
      {tool === "texto" && <rect {...bounds} fill="transparent" onPointerDown={addText} />}
      {texts.map((item) => {
        const fontSize = item.fontSize / 10;
        const textStyle = {
          fontFamily: item.fontFamily, fontSize, fontWeight: item.bold ? 700 : 400,
          fontStyle: item.italic ? "italic" : "normal",
          textDecoration: item.underline ? "underline" : "none",
        } as const;
        return editingId === item.id ? (
          <foreignObject key={item.id} x={item.x} y={item.y} width={Math.max(30, bounds.width / 2)} height={Math.max(8, bounds.height / 4)} style={{ overflow: "visible" }}>
            <DirectTextEditor
              embedded value={activeTextValue} x={0} y={0} width={Math.max(30, bounds.width / 2)}
              style={{ fontFamily: item.fontFamily, fontSize, bold: item.bold, italic: item.italic,
                underline: item.underline, align: item.align, color: item.color }}
              onChange={(value) => {
                activeTextValueRef.current = value;
                setActiveTextValue(value);
                updateTexts(editingViewRef.current, (items) => items.map((current) => current.id === item.id ? { ...current, text: value } : current));
              }}
              onCommit={(value) => commitText(item.id, value)}
              onCancel={() => commitText(item.id)}
            />
          </foreignObject>
        ) : (() => {
          const active = tool === "selecao" || tool === "texto";
          const onDown = (event: React.PointerEvent) => {
            if (!active || event.button !== 0) return;
            event.stopPropagation();
            setSelectedId(item.id);
            checkpoint("text-move:" + Date.now());
            const point = svgPoint(event);
            setDrag({ id: item.id, dx: point.x - item.x, dy: point.y - item.y });
          };
          const onDbl = (event: React.MouseEvent) => { event.stopPropagation(); checkpoint("text-edit:" + item.id); startEditing(item); };
          const isSel = item.id === selectedId;
          return (
            <g key={item.id}>
              {isSel && box && (
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent"
                  className={active ? "cursor-move" : "pointer-events-none"} onPointerDown={onDown} onDoubleClick={onDbl} />
              )}
              <text
                ref={(el) => { textEls.current[item.id] = el; if (isSel) selTextRef.current = el; }}
                x={item.x} y={item.y + fontSize} fill={item.color}
                style={textStyle} textAnchor={item.align === "left" ? "start" : item.align === "center" ? "middle" : "end"}
                className={active ? "cursor-move" : "pointer-events-none"}
                onPointerDown={onDown}
                onDoubleClick={onDbl}
              >
                {shownText(item).split("\n").map((line, index) =>
                  <tspan key={index} x={item.x} dy={index ? fontSize * 1.15 : 0}>{line || " "}</tspan>)}
              </text>
              {item.field && fieldBoxes[item.id] && (() => {
                const fb = fieldBoxes[item.id]!;
                return (
                  <g className="pointer-events-none" data-screen-only>
                    <rect x={fb.x} y={fb.y} width={fb.w} height={fb.h} className="fill-none stroke-cyan" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                    <text x={fb.x} y={fb.y - unit * 0.4} fontSize={unit * 1.1} className="fill-cyan font-mono">{item.field === "nome" ? "NOME" : "Nº"}</text>
                    {(() => {
                      const a = item.fieldAnchor ?? "centro";
                      const ax = a === "esquerda" ? fb.x : a === "direita" ? fb.x + fb.w : fb.x + fb.w / 2;
                      return <line x1={ax} x2={ax} y1={fb.y - unit * 0.8} y2={fb.y + fb.h + unit * 0.8} className="stroke-cyan" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
                    })()}
                  </g>
                );
              })()}
              {isSel && box && (
                <g transform={`translate(${box.x + box.w / 2} ${box.y + box.h / 2})`}>
                  {tool === "selecao"
                    ? selectionBox(box.w, box.h, "amber", startResize)
                    : <rect x={-box.w / 2} y={-box.h / 2} width={box.w} height={box.h} className="fill-none stroke-amber pointer-events-none" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                  {tool === "selecao" && (
                    <text x={0} y={box.h / 2 + unit * 2.2} textAnchor="middle" fontSize={unit * 1.1} className="fill-amber font-mono pointer-events-none">
                      {fmt(box.w)} × {fmt(box.h)} cm
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })();
      })}
      {tool === "texto" && panelHost && createPortal(
        <div
          className="pointer-events-auto absolute left-3 top-3 z-20 w-64 space-y-2 rounded-md border border-line bg-panel p-3 text-xs shadow-lg"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Texto</div>
          <select value={current.fontFamily} onChange={(event) => updateSelected({ fontFamily: event.target.value })} className="h-8 w-full rounded-md border border-input bg-panel2 px-2 text-xs text-foreground" aria-label="Fonte">
            {TEXT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="number" min="1" value={current.fontSize} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) || 1 })} className="h-8 w-16 rounded-md border border-input bg-panel2 px-2 text-xs text-foreground" aria-label="Tamanho da fonte" />
            {([
              ["Negrito", Bold, current.bold, { bold: !current.bold }],
              ["Itálico", Italic, current.italic, { italic: !current.italic }],
              ["Sublinhado", Underline, current.underline, { underline: !current.underline }],
            ] as const).map(([label, Icon, on, patch]) => (
              <button key={label} type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={() => updateSelected(patch)} className={"grid size-8 place-items-center rounded-md border " + (on ? "border-primary text-primary" : "border-line text-foreground")}><Icon className="size-4" /></button>
            ))}
            <input type="color" value={current.color} onChange={(event) => updateSelected({ color: event.target.value })} title="Cor do texto" aria-label="Cor do texto" className="size-8 cursor-pointer rounded border border-line bg-panel2 p-0.5" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {([
              ["left", "Alinhar à esquerda", AlignLeft],
              ["center", "Centralizar", AlignCenter],
              ["right", "Alinhar à direita", AlignRight],
            ] as const).map(([align, label, Icon]) => (
              <button key={align} type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={() => updateSelected({ align })} className={"grid h-8 place-items-center rounded-md border " + (current.align === align ? "border-primary text-primary" : "border-line text-foreground")}><Icon className="size-4" /></button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Campo do time</span>
            <select value={current.field ?? "fixo"} onChange={(event) => setField(event.target.value as "fixo" | "nome" | "numero")} className="h-8 w-full rounded-md border border-input bg-panel2 px-2 text-xs text-foreground" aria-label="Campo do time">
              <option value="fixo">Texto fixo</option>
              <option value="nome">Nome do jogador</option>
              <option value="numero">Número do jogador</option>
            </select>
          </label>
          {current.field === "nome" && (
            <>
              <label className="flex items-center gap-2 text-foreground">
                <input type="checkbox" checked={!!current.upper} onChange={(event) => updateSelected({ upper: event.target.checked })} />
                MAIÚSCULAS
              </label>
              <label className="block space-y-1">
                <span className="text-faint">Largura máxima (cm)</span>
                <input type="number" min="0" step="0.1" value={current.fitWidth ?? ""} placeholder="sem limite"
                  onChange={(event) => { const v = Number(event.target.value); updateSelected({ fitWidth: event.target.value && v > 0 ? v : undefined }); }}
                  className="h-8 w-full rounded-md border border-input bg-panel2 px-2 text-xs text-foreground" aria-label="Largura máxima (cm)" />
              </label>
              <button type="button" disabled={!selected || !box} onMouseDown={(event) => event.preventDefault()}
                onClick={() => box && updateSelected({ fitWidth: Math.round(box.w * 10) / 10 })}
                className="h-8 w-full rounded-md border border-line text-foreground disabled:opacity-50">Usar a largura atual do texto</button>
            </>
          )}
          {current.field && (
            <div className="space-y-1">
              <span className="text-faint">Ponto fixo</span>
              <div className="grid grid-cols-3 gap-1">
                {(["esquerda", "centro", "direita"] as const).map((a) => (
                  <button key={a} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => updateSelected({ fieldAnchor: a })}
                    className={"h-8 rounded-md border text-xs " + ((current.fieldAnchor ?? "centro") === a ? "border-primary text-primary" : "border-line text-foreground")}>
                    {a === "esquerda" ? "Esquerda" : a === "centro" ? "Centro" : "Direita"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {current.field && (
            <label className="flex items-center gap-2 text-foreground">
              <input type="checkbox" checked={current.scaleWithSize !== false} onChange={(event) => updateSelected({ scaleWithSize: event.target.checked })} />
              Escalar com o tamanho
            </label>
          )}
        </div>, panelHost)}
    </g>
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
  const [texts, setTexts] = useState<TextsByView>(NO_TEXTS);
  const [roster, setRoster] = useState<Player[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const rosterLoaded = useRef(false);
  const [teamView, setTeamView] = useState<{ id: string; prev: Size } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    void fontsReady().then(() => setFontsTick((t) => t + 1));
  }, []);
  useEffect(() => {
    void getBig().then((big) => {
      try {
        setRoster(sanitizeRoster(big[LS_TEAM] ?? []));
      } catch {
        /* lista corrompida */
      }
      rosterLoaded.current = true;
    });
  }, []);
  useEffect(() => {
    if (!rosterLoaded.current) return;
    const t = setTimeout(() => saveLS(LS_TEAM, roster), 400);
    return () => clearTimeout(t);
  }, [roster]);
  const textsHydrated = useRef(false);
  const [selLayer, setSelLayer] = useState<string | null>(null);
  const [selText, setSelText] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [importMsg, setImportMsg] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("preenchimento");
  const [pcEdit, setPcEdit] = useState(false);
  const [imgEditOpen, setImgEditOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRootRef = useRef<Root | null>(null);
  const contextMenuHostRef = useRef<HTMLDivElement | null>(null);
  const clipboardLayerRef = useRef<Layer | null>(null);
  const pcEditStartRef = useRef<() => void>(() => {});
  const [shapes, setShapes] = useState<Shapes>(DEFAULT_SHAPES);
  const [size, setSize] = useState<Size>("M");
  const [view, setView] = useState<View>("frente");
  const [panel, setPanel] = useState<"medidas" | "tabela">("medidas");
  const [overlay, setOverlay] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [tool, setTool] = useState<Tool>("forma");
  const [drawOpts, setDrawOpts] = useState<DrawOpts>(DEFAULT_DRAW_OPTS);
  const [fitSignal, setFitSignal] = useState(0);
  const [sidebars, setSidebars] = useState({ left: true, right: true });
  const [showSeam, setShowSeam] = useState(true);
  const [showBleed, setShowBleed] = useState(true);
  const [showSafety, setShowSafety] = useState(true);
  const [plotterOpen, setPlotterOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState<TeamFormat>("pdf");
  const [expDpi, setExpDpi] = useState(300);
  const [expQuality, setExpQuality] = useState(92);
  const [expSizeMode, setExpSizeMode] = useState<"atual" | "todos" | "escolher">("atual");
  const [expSizes, setExpSizes] = useState<Size[]>([]);
  const [expViewMode, setExpViewMode] = useState<"atual" | "todas" | "escolher">("atual");
  const [expViews, setExpViews] = useState<View[]>([]);
  const [expProgress, setExpProgress] = useState<{ done: number; total: number } | null>(null);
  const expSignal = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [hideTech, setHideTech] = useState(false);
  const [cropRect, setCropRect] = useState(true);
  const [exporting, setExporting] = useState(false);


  const deleteSelectionRef = useRef<() => boolean>(() => false);
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
    selectLayer(String((pasted as Layer & { id?: string }).id));
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
      const typing = isTypingTarget(e.target);
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
        if (deleteSelectionRef.current()) e.preventDefault();
        return;
      }
      if (typing || modifier) return;
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) setTool(t.k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layers, view, selLayer, selText]);

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


  // Carregar do armazenamento local
  useEffect(() => {
    let alive = true;
    void getBig().then((big) => {
    if (!alive) return;
    const asObj = (v: unknown) => (v && typeof v === "object" ? (v as object) : null);
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
      const a = asObj(big[LS_ART]);
      if (a) setArtworks({ ...NO_ART, ...a });
      const st = asObj(big[LS_STYLES]);
      if (st) setStyles({ ...DEFAULT_STYLES, ...st });
      const sh = asObj(big[LS_SHAPES]);
      if (sh) setShapes({ ...DEFAULT_SHAPES, ...sh });
      const ly = asObj(big[LS_LAYERS]);
      if (ly) setLayers({ ...NO_LAYERS, ...ly });
      const tx = asObj(big[LS_TEXTS]);
      if (tx) setTexts({ ...NO_TEXTS, ...tx });
      textsHydrated.current = true;
      const sb = localStorage.getItem(LS_SIDEBARS);
      if (sb) setSidebars((cur) => ({ ...cur, ...JSON.parse(sb) }));
    } catch {
      /* ignora dados corrompidos */
    }
    bigHydrated = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleSidebar = (side: "left" | "right") =>
    setSidebars((cur) => {
      const next = { ...cur, [side]: !cur[side] };
      saveLS(LS_SIDEBARS, next);
      return next;
    });

  // Grava os textos com atraso de 300 ms (evita gravar a cada tecla).
  useEffect(() => {
    if (!textsHydrated.current) return;
    const t = setTimeout(() => saveLS(LS_TEXTS, texts), 300);
    return () => clearTimeout(t);
  }, [texts]);

  /* ---------- Histórico (Desfazer / Refazer) ---------- */
  type Snap = { table: Grading; shapes: Shapes; artworks: Artworks; styles: Styles; layers: Layers; texts: TextsByView };
  const snapRef = useRef<Snap>({ table, shapes, artworks, styles, layers, texts });
  snapRef.current = { table, shapes, artworks, styles, layers, texts };
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
    saveLS(LS_SHAPES, sn.shapes);
    saveLS(LS_STYLES, sn.styles);
    saveLS(LS_ART, sn.artworks);
    saveLS(LS_LAYERS, sn.layers);
    setTexts(sn.texts);
    saveLS(LS_TEXTS, sn.texts);
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
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
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

  /* ---------- Arquivo de projeto (.moldecore) ---------- */
  const [projectName, setProjectName] = useState("Sem título");
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const cleanUntil = useRef(Date.now() + 1500);
  const fileHandle = useRef<FileHandle | null>(null);
  const [askUnsaved, setAskUnsaved] = useState<null | ((c: "save" | "discard" | "cancel") => void)>(null);
  const dirty = rev !== savedRev;
  const markClean = () => {
    cleanUntil.current = Date.now() + 400;
    setSavedRev(rev);
  };
  useEffect(() => {
    setRev((r) => {
      const n = r + 1;
      if (Date.now() < cleanUntil.current) setSavedRev(n);
      return n;
    });
  }, [table, shapes, artworks, styles, layers, texts, mother, clothingType, profiles, activeProfile, roster]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const projectText = (name: string) =>
    buildProjectFile(name, { grading: table, mother, clothingType, shapes, artworks, styles, layers, texts, profiles, activeProfile, roster });

  const saveProject = async (as: boolean): Promise<boolean> => {
    try {
      let h = as ? null : fileHandle.current;
      let name = projectName;
      if (!h && hasFsAccess()) {
        h = await pickSaveHandle(name + PROJECT_EXT);
        if (!h) return false;
        name = nameFromFile(h.name);
      }
      const text = projectText(name);
      if (h) {
        await writeHandle(h, text);
        fileHandle.current = h;
      } else downloadText(text, name + PROJECT_EXT);
      setProjectName(name);
      setSavedRev(rev);
      toast.success("Projeto salvo");
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      toast.error("Não foi possível salvar: " + ((e as Error)?.message || "erro desconhecido"));
      return false;
    }
  };

  const confirmUnsaved = async (): Promise<boolean> => {
    if (!dirty) return true;
    const c = await new Promise<"save" | "discard" | "cancel">((res) => setAskUnsaved(() => res));
    setAskUnsaved(null);
    if (c === "cancel") return false;
    if (c === "save") return saveProject(false);
    return true;
  };

  const resetHistory = () => {
    setPast([]);
    setFuture([]);
    lastCp.current = { key: "", t: 0 };
  };

  const newProject = async () => {
    if (!(await confirmUnsaved())) return;
    cleanUntil.current = Date.now() + 400;
    setLayers(NO_LAYERS);
    setArtworks(NO_ART);
    setTexts(NO_TEXTS);
    setShapes(DEFAULT_SHAPES);
    setStyles(DEFAULT_STYLES);
    saveLS(LS_LAYERS, NO_LAYERS);
    saveLS(LS_ART, NO_ART);
    saveLS(LS_TEXTS, NO_TEXTS);
    saveLS(LS_SHAPES, DEFAULT_SHAPES);
    saveLS(LS_STYLES, DEFAULT_STYLES);
    resetHistory();
    fileHandle.current = null;
    setProjectName("Sem título");
    markClean();
    toast.success("Novo projeto criado");
  };

  const openProject = async () => {
    if (!(await confirmUnsaved())) return;
    let res: Awaited<ReturnType<typeof openProjectFile>>;
    try {
      res = await openProjectFile();
    } catch (e) {
      toast.error("Não foi possível abrir: " + ((e as Error)?.message || "erro desconhecido"));
      return;
    }
    if (!res) return;
    const parsed = parseProjectFile(res.text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const d = parsed.data;
    const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    try {
      const g = obj(d.grading);
      const grading = { ...DEFAULT_TABLE } as Grading;
      for (const s of SIZES) {
        const row = g[s];
        if (row && typeof row === "object") grading[s] = { ...DEFAULT_TABLE[s], ...(row as object) };
      }
      const nArt = { ...NO_ART, ...obj(d.artworks) } as Artworks;
      const nStyles = { ...DEFAULT_STYLES, ...obj(d.styles) } as Styles;
      const nShapes = { ...DEFAULT_SHAPES, ...obj(d.shapes) } as Shapes;
      const nLayers = { ...NO_LAYERS, ...obj(d.layers) } as Layers;
      const nTexts = { ...NO_TEXTS, ...obj(d.texts) } as TextsByView;
      const nMother = (SIZES as readonly string[]).includes(d.mother ?? "") ? (d.mother as Size) : mother;
      const nType = typeof d.clothingType === "string" && d.clothingType in PRESET_TABLES ? (d.clothingType as ClothingType) : clothingType;
      // Perfis: adiciona por nome, sem sobrescrever perfis locais.
      const incoming = Array.isArray(d.profiles) ? (d.profiles as GradeProfile[]) : [];
      const merged = [...profiles];
      for (const p of incoming) {
        if (!p || typeof p.name !== "string" || !p.name.trim()) continue;
        if (merged.some((m) => m.name.toLowerCase() === p.name.toLowerCase())) continue;
        merged.push({ name: p.name, tables: { ...defaultTablesForProfiles(), ...obj(p.tables) } as ProfileTables });
      }
      const nActive = typeof d.activeProfile === "string" && merged.some((m) => m.name === d.activeProfile) ? d.activeProfile : activeProfile;

      cleanUntil.current = Date.now() + 400;
      setTable(grading);
      setMother(nMother);
      setSize(nMother);
      setClothingType(nType);
      setArtworks(nArt);
      setStyles(nStyles);
      setShapes(nShapes);
      setLayers(nLayers);
      setTexts(nTexts);
      const nRoster = sanitizeRoster(d.roster);
      setRoster(nRoster);
      saveLS(LS_TEAM, nRoster);
      setProfiles(merged);
      setActiveProfile(nActive);
      saveLS(LS_GRADING, grading);
      localStorage.setItem(LS_MOTHER, nMother);
      saveLS(LS_ART, nArt);
      saveLS(LS_STYLES, nStyles);
      saveLS(LS_SHAPES, nShapes);
      saveLS(LS_LAYERS, nLayers);
      saveLS(LS_TEXTS, nTexts);
      saveGradeProfiles(merged);
      localStorage.setItem(LS_ACTIVE_PROFILE, nActive);
      resetHistory();
      fileHandle.current = res.handle;
      setProjectName(parsed.name.trim() || nameFromFile(res.name));
      if (res.handle) setProjectName(nameFromFile(res.name));
      markClean();
      toast.success("Projeto aberto");
    } catch {
      toast.error("Arquivo inválido ou corrompido.");
    }
  };

  const fileActions = useRef({ saveProject, openProject });
  fileActions.current = { saveProject, openProject };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void fileActions.current.saveProject(e.shiftKey);
      } else if (k === "o") {
        e.preventDefault();
        void fileActions.current.openProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateShapes = (next: Shapes) => {
    checkpoint("shapes");
    setShapes(next);
    saveLS(LS_SHAPES, next);
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
  }, [profiles, activeProfile, clothingType]);

  // Desmonta as camadas flutuantes só ao sair da página, fora do ciclo de render.
  useEffect(() => {
    return () => {
      const roots = [profileRootRef.current, contextMenuRootRef.current];
      const hosts = [profileHostRef.current, contextMenuHostRef.current];
      profileRootRef.current = null;
      profileHostRef.current = null;
      contextMenuRootRef.current = null;
      contextMenuHostRef.current = null;
      setTimeout(() => {
        roots.forEach((root) => root?.unmount());
        hosts.forEach((host) => host?.remove());
      }, 0);
    };
  }, []);

  const updateTable = (sz: Size, key: Field, v: number) => updateMeasures(sz, { [key]: v }, `table:${sz}:${key}`);

  const updateMeasures = (sz: Size, patch: Partial<Measurements>, key = `table:${sz}`) => {
    checkpoint(key);
    setTable((t) => {
      const next = { ...t, [sz]: { ...t[sz], ...patch } };
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
      saveLS(LS_ART, next);
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

  /* ---------- Ferramenta Seleção: objeto ativo e propriedades ---------- */
  const [selPart, setSelPart] = useState<"peca" | "estampa" | null>(null);
  /* Modo "Inserir no PowerClip": só ativado pelo menu do botão direito. */
  const [pcPick, setPcPick] = useState<"art" | string | null>(null);
  useEffect(() => {
    setPcPick(null);
  }, [tool, view, selLayer, selPart]);
  useEffect(() => {
    if (!pcPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPcPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pcPick]);
  const [lockRatio, setLockRatio] = useState(true);

  useEffect(() => {
    setPcEdit(false);
    setSelLayer(null);
    setSelPart(null);
  }, [view]);

  const selectLayer = (id: string | null) => {
    // Fora de "Editar Conteúdo do PowerClip", camadas recortadas não são selecionáveis.
    if (id && !pcEdit && layers[view].find((l) => l.id === id)?.clipped) return;
    setSelLayer(id);
    if (id) {
      setSelPart(null);
      setSelText(null);
    }
  };
  const selectPart = (p: "peca" | "estampa" | null) => {
    setSelPart(p);
    if (p) {
      setSelLayer(null);
      setSelText(null);
    }
  };
  const selectText = (id: string | null) => {
    setSelText(id);
    if (id) {
      setSelLayer(null);
      setSelPart(null);
    }
  };
  const isBodyView = view === "frente" || view === "costas";
  const pieceW = isBodyView ? graded[size].bodyWidth : graded[size].sleeveWidth;
  const pieceH = isBodyView ? graded[size].bodyHeight : graded[size].sleeveHeight;
  /* Frente e costas compartilham as medidas do corpo: redimensionar uma atualiza a outra. */
  const setPieceDims = (w: number, h: number) =>
    updateMeasures(
      size,
      isBodyView ? { bodyWidth: round1(w), bodyHeight: round1(h) } : { sleeveWidth: round1(w), sleeveHeight: round1(h) },
      `resize:${size}:${isBodyView ? "corpo" : "manga"}`,
    );

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
      selectLayer(id);
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
    if (!curLayers.some((x) => x.id === id)) return;
    setViewLayers(
      curLayers.map((l) =>
        l.id === id ? { ...l, clipped: true, init: { cx: l.cx, cy: l.cy, w: l.w, ratio: l.ratio, rot: l.rot ?? 0 } } : l,
      ),
      "pc-layer:" + Date.now(),
    );
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
    saveLS(LS_SHAPES, ns);
    saveLS(LS_LAYERS, nl);
    setSelLayer(null);
    setTool("forma");
  };

  /* ---------- Pré-visualização do jogador (somente leitura, fora do desfazer) ---------- */
  const viewPlayer = teamView ? roster.find((p) => p.id === teamView.id) ?? null : null;
  const playerSizeOk = (p: Player) => sizeIdsForGarment(clothingType).includes(p.tamanho);
  const startTeamView = (id: string) => {
    const p = roster.find((x) => x.id === id);
    if (!p || !playerSizeOk(p)) return;
    setSelText(null);
    setTeamView((cur) => ({ id, prev: cur?.prev ?? size }));
    setSize(p.tamanho);
  };
  const exitTeamView = () => {
    if (teamView) setSize(teamView.prev);
    setTeamView(null);
  };
  const stepPlayer = (dir: 1 | -1) => {
    const list = roster.filter(playerSizeOk);
    if (!list.length || !teamView) return;
    const i = list.findIndex((p) => p.id === teamView.id);
    startTeamView(list[(i + dir + list.length) % list.length]!.id);
  };
  useEffect(() => {
    if (teamView && (!viewPlayer || !playerSizeOk(viewPlayer))) exitTeamView();
    else if (viewPlayer && size !== viewPlayer.tamanho) setSize(viewPlayer.tamanho);
  }, [viewPlayer?.tamanho, viewPlayer?.id, clothingType]);
  const teamPreview = useMemo<{ texts: TextElement[]; overflow: boolean } | null>(() => {
    if (!viewPlayer) return null;
    const { sx, sy } = teamScale(table, mother, viewPlayer.tamanho, view);
    const W = pieceWidth(viewPlayer.tamanho as Size, view);
    const out: TextElement[] = [];
    let overflow = false;
    for (const t of texts[view]) {
      const value = t.field === "nome" ? viewPlayer.nome : t.field === "numero" ? viewPlayer.numero : null;
      const r = resolveTeamText(t, { value, sx, sy, measure: measureText });
      if (teamTextOverflows(r, W)) overflow = true;
      if (r && r.text.trim()) {
        const { left: _l, right: _r, ...rest } = r;
        out.push({ ...t, ...rest, align: r.align ?? t.align });
      }
    }
    return { texts: out, overflow };
  }, [viewPlayer, table, mother, view, texts, fontsTick]);
  const teamPreviewTexts = teamPreview?.texts ?? null;

  const selTextEl = selText ? texts[view].find((t) => t.id === selText) ?? null : null;
  const colorKind: "vetor" | "texto" | "imagem" | "molde" =
    selObj && selObj.paths && !selObj.src ? "vetor" : selTextEl ? "texto" : selObj || (selPart === "estampa" && art) ? "imagem" : "molde";
  const colorLabel =
    colorKind === "vetor" ? selObj!.name : colorKind === "texto" ? "Texto" : colorKind === "imagem" ? "(imagem sem cor)" : "Molde";
  const colorCurrent: { stroke: string | null; fill: string | null; mixedFill?: boolean; mixedStroke?: boolean } = (() => {
    if (colorKind === "vetor") {
      const ps = selObj!.paths!;
      const f = ps[0]?.fill ?? null;
      const s = ps[0]?.stroke ?? null;
      return { fill: f, stroke: s, mixedFill: ps.some((p) => p.fill !== f), mixedStroke: ps.some((p) => p.stroke !== s) };
    }
    if (colorKind === "texto") return { fill: selTextEl!.color, stroke: null };
    if (colorKind === "imagem") return { fill: null, stroke: null };
    return { fill: styles[view].fill ?? null, stroke: styles[view].stroke ?? null };
  })();

  const applyColor = (t: ColorTarget, hex: string | null) => {
    if (colorKind === "imagem") return;
    if (colorKind === "texto") {
      if (t !== "preenchimento" || !hex) return;
      checkpoint("color:" + Date.now());
      setTexts({ ...texts, [view]: texts[view].map((x) => (x.id === selText ? { ...x, color: hex } : x)) });
      return;
    }
    if (colorKind === "vetor" && selObj) {
      const aw = Math.max(1e-6, selObj.w * pieceW);
      const next = curLayers.map((l) =>
        l.id !== selObj.id || !l.paths
          ? l
          : {
              ...l,
              paths: l.paths.map((p) =>
                t === "contorno"
                  ? { ...p, stroke: hex, sw: hex && !(p.sw > 0) ? 0.1 / aw : p.sw }
                  : { ...p, fill: hex },
              ),
            },
      );
      setViewLayers(next, "color:" + Date.now());
      return;
    }
    checkpoint("color:" + Date.now());
    const next = { ...styles, [view]: { ...styles[view], [t === "contorno" ? "stroke" : "fill"]: hex } };
    setStyles(next);
    saveLS(LS_STYLES, next);
  };

  const setArt = (a: Artwork | null) => updateArtworks({ ...artworks, [view]: a });

  /* Objeto ativo da Ferramenta Seleção, com dimensões em cm reais para a barra de propriedades. */
  const pieceSpan = (() => {
    const ns = shapes[view];
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    return { x: Math.max(1e-3, Math.max(...xs) - Math.min(...xs)), y: Math.max(1e-3, Math.max(...ys) - Math.min(...ys)) };
  })();
  const boxInfo = <T extends BoxObject>(o: T, label: string, apply: (next: T) => void): SelectionInfo => {
    const w = o.w * pieceW;
    return { label, w, h: w * o.ratio, set: (nw, nh) => apply({ ...o, w: nw / pieceW, ratio: nh / nw }) };
  };
  const selInfo: SelectionInfo | null =
    tool !== "selecao"
      ? null
      : selObj
        ? boxInfo(selObj, selObj.name, (next) => setViewLayers(curLayers.map((l) => (l.id === next.id ? next : l)), `resize:${next.id}`))
        : selPart === "estampa" && art && size === mother && (art.clipped === false || pcEdit)
          ? boxInfo(art, "Estampa", setArt)
          : selPart === "peca"
            ? {
                label: `Molde · ${partLabel(view)}`,
                w: pieceSpan.x * pieceW,
                h: pieceSpan.y * pieceH,
                set: (nw, nh) => setPieceDims(nw / pieceSpan.x, nh / pieceSpan.y),
              }
            : null;
  const pcApply = () => {
    // Só aplica (recorta) a estampa fora da edição; "Concluir Edição" não recorta itens extraídos.
    if (art && !pcEdit && art.clipped === false)
      setArt({
        ...art,
        clipped: true,
        init: art.init ?? { cx: art.cx, cy: art.cy, w: art.w, ratio: art.ratio, rot: art.rot ?? 0 },
        pre: art.clipped === false ? { cx: art.cx, cy: art.cy, w: art.w, rot: art.rot ?? 0 } : art.pre,
      });
    setPcEdit(false);
    if (selPart === "estampa") setSelPart(null);
    if (selLayer && curLayers.find((l) => l.id === selLayer)?.clipped) setSelLayer(null);
  };
  const hasClipped = curLayers.some((l) => l.clipped);
  const pcHasContent = (!!art && art.clipped !== false) || hasClipped;
  useEffect(() => {
    if (!pcEdit && selLayer && layers[view].find((l) => l.id === selLayer)?.clipped) setSelLayer(null);
  }, [pcEdit, selLayer, layers, view]);
  // Ao sair da edição do PowerClip, limpa qualquer seleção fantasma da arte recortada.
  useEffect(() => {
    if (!pcEdit && selPart === "estampa" && art && art.clipped !== false) setSelPart(null);
  }, [pcEdit, selPart, art]);
  const pcEditStart = () => {
    setSize(mother);
    setTool("selecao");
    setPcEdit(true);
  };
  pcEditStartRef.current = pcEditStart;
  /** Aplica camadas e/ou estampa da vista atual com UM único passo de desfazer. */
  const commitView = (key: string, nextLayers: Layer[] | null, nextArt: Artwork | null | undefined) => {
    checkpoint(key);
    if (nextLayers) {
      const all = { ...snapRef.current.layers, [view]: nextLayers };
      setLayers(all);
      saveLS(LS_LAYERS, all);
    }
    if (nextArt !== undefined) {
      const all = { ...snapRef.current.artworks, [view]: nextArt };
      setArtworks(all);
      try {
        saveLS(LS_ART, all);
      } catch {
        /* imagem grande demais */
      }
    }
  };
  const artClipped = !!art && art.clipped !== false;
  const selClippedLayer = pcEdit && selLayer ? curLayers.find((l) => l.id === selLayer && l.clipped) ?? null : null;
  const selClippedArt = pcEdit && selPart === "estampa" && artClipped;
  const canExtractSelected = !!selClippedLayer || selClippedArt;
  /** Em edição: tira só o item selecionado, mantém posição/seleção e a edição ativa. */
  const pcExtractSelected = () => {
    if (selClippedLayer) {
      const id = selClippedLayer.id;
      commitView("pc-out:" + Date.now(), curLayers.map((l) => (l.id === id ? { ...l, clipped: false } : l)), undefined);
      setSelLayer(id);
      return;
    }
    if (selClippedArt && art) {
      commitView("pc-out-art:" + Date.now(), null, { ...art, clipped: false });
      setSelPart("estampa");
    }
  };
  /** Extrai tudo (camadas recortadas + estampa) e sai da edição. */
  const pcExtractAll = () => {
    if (!pcHasContent) return;
    commitView(
      "pc-out-all:" + Date.now(),
      hasClipped ? curLayers.map((l) => (l.clipped ? { ...l, clipped: false } : l)) : null,
      artClipped && art ? { ...art, clipped: false } : undefined,
    );
    setPcEdit(false);
    setSelLayer(null);
  };
  // PowerClip vazio em edição → sai automaticamente.
  useEffect(() => {
    if (pcEdit && !pcHasContent) {
      setPcEdit(false);
      if (selLayer && layers[view].find((l) => l.id === selLayer)?.clipped) setSelLayer(null);
    }
  }, [pcEdit, pcHasContent]);
  const artDeletable = selPart === "estampa" && !!art && (art.clipped === false || pcEdit);
  const canDeleteSelection = !!selObj || artDeletable || !!selText;
  /** Decide o que apagar: camada, estampa (ou texto, só via menu). Molde nunca. */
  const deleteSelection = (includeText = false) => {
    if (selObj) {
      commitView("del:" + Date.now(), curLayers.filter((l) => l.id !== selObj.id), undefined);
      setSelLayer(null);
      setMenu(null);
      return true;
    }
    if (artDeletable) {
      commitView("art-del:" + Date.now(), null, null);
      setSelPart(null);
      setMenu(null);
      return true;
    }
    if (includeText && selText) {
      const id = selText;
      checkpoint("text-del:" + Date.now());
      setTexts({ ...texts, [view]: texts[view].filter((t) => t.id !== id) });
      setSelText(null);
      setMenu(null);
      return true;
    }
    return false;
  };
  deleteSelectionRef.current = () => deleteSelection(false);
  /** "Remover do PowerClip" do painel: só o item selecionado, sem sair da edição. */
  const pcRemove = () => {
    if (selClippedLayer) {
      const id = selClippedLayer.id;
      commitView("pc-rm:" + Date.now(), curLayers.map((l) => (l.id === id ? { ...l, clipped: false } : l)), undefined);
      setSelLayer(id);
      return;
    }
    if (art && artClipped) {
      commitView("pc-rm-art:" + Date.now(), null, { ...art, ...(art.pre ?? {}), clipped: false });
      setSelPart("estampa");
    }
  };
  /** Item recortado selecionado, adaptado para o painel Editor do PowerClip. */
  const pcTarget: Artwork | null = selClippedArt && art
    ? art
    : selClippedLayer
      ? {
          src: selClippedLayer.src ?? vectorDataUrl(selClippedLayer),
          name: selClippedLayer.name,
          cx: selClippedLayer.cx,
          cy: selClippedLayer.cy,
          w: selClippedLayer.w,
          ratio: selClippedLayer.ratio,
          rot: selClippedLayer.rot ?? 0,
          ...(selClippedLayer.init ? { init: selClippedLayer.init } : {}),
        }
      : null;
  const pcTargetChange = (next: Artwork) => {
    if (selClippedArt) return setArt(next);
    const l = selClippedLayer;
    if (!l) return;
    const isImg = !!l.src;
    setViewLayers(
      curLayers.map((x) =>
        x.id === l.id
          ? { ...x, cx: next.cx, cy: next.cy, w: next.w, ratio: next.ratio, rot: next.rot ?? 0, ...(isImg ? { src: next.src, name: next.name ?? x.name } : {}) }
          : x,
      ),
      "pc-edit:" + l.id,
    );
  };
  const pcFrame = (() => {
    const b = pathBounds(offsetPathD(buildPath(shapes[view], pieceW, pieceH), BLEED_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS)) ?? {
      minX: -pieceW / 2 - PLOTTER_MARGIN, minY: -PLOTTER_MARGIN, maxX: pieceW / 2 + PLOTTER_MARGIN, maxY: pieceH + PLOTTER_MARGIN,
    };
    return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
  })();
  const pcFileBase = `MOLDE_${partLabel(view).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "_")}_TAMANHO_${size}`;
  const showPcEditor = tool === "selecao" && pcEdit && size === mother && !!pcTarget;
  const pcState = pcEdit ? "editing" : pcHasContent ? "locked" : art ? "free" : "none";
  const artFree = !!art && art.clipped === false;




  /* ================= Exportação inteligente para Plotter ================= */



  const buildPlotterSvgFor = (o: { view: View; size: Size; hideTechnical: boolean; crop: boolean; player?: Player }) => {
    const { view, size } = o;
    const art = artworks[view];
    const curLayers = layers[view];
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
      const im = `<image href="${art.src}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" transform="${artTransform(art, ax + aw / 2, ay + ah / 2)}" opacity="${art.opacity ?? 1}" preserveAspectRatio="none"/>`;
      img = art.clipped === false ? im : `<g clip-path="url(#moldeClip)">${im}</g>`;
    }

    const objs = curLayers.map((l) => (l.clipped ? `<g clip-path="url(#moldeClip)">${layerMarkup(l, W, H)}</g>` : layerMarkup(l, W, H))).join("");
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
    const label = `<text x="${(x0 + 0.6).toFixed(2)}" y="${(y0 + 1.3).toFixed(2)}" font-family="monospace" font-size="1" fill="#111827">${escXml(techLabel(clothingType, size, view) + (o.player ? ` · Nº ${o.player.numero}${o.player.nome ? " " + o.player.nome : ""}` : ""))}</text>`;

    /* A janela de exportação é recortada exatamente nos limites do quadro. */
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cmW.toFixed(3)}cm" height="${cmH.toFixed(3)}cm" viewBox="${x0.toFixed(3)} ${y0.toFixed(3)} ${cmW.toFixed(3)} ${cmH.toFixed(3)}">` +
      `<defs><clipPath id="moldeClip"><rect x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" width="${cmW.toFixed(3)}" height="${cmH.toFixed(3)}"/></clipPath></defs>` +
      body +
      img +
      objs +
      textMarkup(texts[view], o.player ? { resolve: teamResolver(o.player, size, view) } : undefined) +
      tech +
      outline +
      frame +
      label +
      `</svg>`;
    return { svg, cmW, cmH };
  };

  const buildPlotterSvg = (o: { hideTechnical: boolean; crop: boolean }) => buildPlotterSvgFor({ ...o, view, size });

  /** Largura da peça (cm) no tamanho e vista. */
  function pieceWidth(sz: Size, v: View) {
    const d = table[sz];
    if (!d) return Infinity;
    return v === "frente" || v === "costas" ? d.bodyWidth : d.sleeveWidth;
  }

  const teamResolver = (p: Player, sz: Size, v: View): TextResolve => {
    const { sx, sy } = teamScale(table, mother, sz, v);
    return (t) => {
      const value = t.field === "nome" ? p.nome : t.field === "numero" ? p.numero : null;
      return resolveTeamText(t, { value, sx, sy, measure: measureText });
    };
  };

  /** Maior peça (cm) entre os tamanhos dos jogadores × vistas. */
  const teamMaxPiece = (players: Player[], views: View[]) => {
    let best = { cmW: 0, cmH: 0 };
    const seen = new Set<string>();
    for (const p of players) for (const v of views) {
      const k = p.tamanho + "|" + v;
      if (seen.has(k) || !(p.tamanho in table)) continue;
      seen.add(k);
      const { cmW, cmH } = buildPlotterSvgFor({ view: v, size: p.tamanho as Size, hideTechnical: true, crop: true });
      if (cmW * cmH > best.cmW * best.cmH) best = { cmW, cmH };
    }
    return best;
  };

  const exportTeam = async (opt: TeamExportOpts, onProgress: (done: number, total: number) => void, signal: { cancelled: boolean }) => {
    await fontsReady();
    const files: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    const warnings: string[] = [];
    const total = opt.players.length * opt.views.length;
    let n = 0;
    const ext = TEAM_EXT[opt.format];
    onProgress(0, total);
    for (const p of opt.players) {
      for (const v of opt.views) {
        if (signal.cancelled) return null;
        const sz = p.tamanho as Size;
        const { svg, cmW, cmH } = buildPlotterSvgFor({ view: v, size: sz, hideTechnical: opt.hideTechnical, crop: true, player: p });
        const label = sizeLabel(clothingType, sz);
        const name = uniqueName(teamFileName(opt.template, { numero: p.numero, nome: p.nome, tamanho: label, vista: v }, ext), used);
        const r = await renderPiece(svg, cmW, cmH, opt.format, opt.dpi, opt.quality, name);
        if (r.reduced) warnings.push(`${label} (${v}) gerado a ${r.dpi} DPI para caber no navegador`);
        const res = teamResolver(p, sz, v);
        const W = pieceWidth(sz, v);
        if (texts[v].some((t) => t.field && teamTextOverflows(res(t), W)))
          warnings.push(`${p.numero || "—"} ${p.nome || "(sem nome)"} (${partLabel(v)}): o nome passa da largura da peça`);
        files[name] = r.bytes;
        n++;
        onProgress(n, total);
        await yieldFrame();
      }
    }
    if (signal.cancelled) return null;
    const zip = await zipFiles(files, opt.format);
    if (signal.cancelled) return null;
    downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `Time_${todayStamp()}.zip`);
    return { players: opt.players.length, files: n, warnings: [...new Set(warnings)] };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = filename;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const printVectorPdf = (svg: string, cmW: number, cmH: number, name: string) => {
    const win = window.open("", "_blank", "width=900,height=720");
    if (!win) return false;
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>` +
        `<style>@page{size:${cmW}cm ${cmH}cm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${cmW}cm;height:${cmH}cm}</style>` +
        `</head><body>${svg}<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},400);});<\/script></body></html>`,
    );
    win.document.close();
    return true;
  };

  const ALL_VIEWS: View[] = ["frente", "costas", "mangaEsq", "mangaDir"];
  const exportTargets = () => {
    const allSizes = sizeIdsForGarment(clothingType);
    const sizes = expSizeMode === "atual" ? [size] : expSizeMode === "todos" ? [...allSizes] : allSizes.filter((s) => expSizes.includes(s));
    const views = expViewMode === "atual" ? [view] : expViewMode === "todas" ? ALL_VIEWS : ALL_VIEWS.filter((v) => expViews.includes(v));
    return { sizes, views, count: sizes.length * views.length };
  };
  const exportMaxPiece = () => {
    const { sizes, views } = exportTargets();
    let best = { cmW: 0, cmH: 0 };
    for (const s of sizes) for (const v of views) {
      if (!(s in table)) continue;
      const { cmW, cmH } = buildPlotterSvgFor({ view: v, size: s, hideTechnical: hideTech, crop: cropRect });
      if (cmW * cmH > best.cmW * best.cmH) best = { cmW, cmH };
    }
    return best;
  };

  const flashSaved = (m: string, ms = 4500) => {
    setSavedMsg(m);
    setTimeout(() => setSavedMsg(""), ms);
  };

  const runExport = async () => {
    const { sizes, views, count } = exportTargets();
    if (!count) return flashSaved("Escolha ao menos um tamanho e uma vista", 3500);
    const sig = { cancelled: false };
    expSignal.current = sig;
    setExporting(true);
    try {
      await fontsReady();
      const ext = TEAM_EXT[exportFmt];
      if (count === 1) {
        const s = sizes[0]!;
        const v = views[0]!;
        const { svg, cmW, cmH } = buildPlotterSvgFor({ view: v, size: s, hideTechnical: hideTech, crop: cropRect });
        const base = exportName(clothingType, s, v);
        if (exportFmt === "pdf") {
          if (printVectorPdf(await embedFonts(svg), cmW, cmH, base)) flashSaved("Arquivo 1:1 pronto — na janela de impressão escolha Salvar como PDF");
          else {
            const r = await renderPiece(svg, cmW, cmH, "pdf", expDpi, expQuality, base);
            downloadBlob(new Blob([r.bytes as BlobPart], { type: MIME.pdf }), `${base}.pdf`);
            flashSaved("Janela de impressão bloqueada — PDF gerado em alta resolução");
          }
        } else {
          const r = await renderPiece(svg, cmW, cmH, exportFmt, expDpi, expQuality, base);
          downloadBlob(new Blob([r.bytes as BlobPart], { type: MIME[exportFmt] }), `${base}.${ext}`);
          flashSaved(`${exportFmt.toUpperCase()} ${r.dpi} DPI gerado no tamanho real` + (r.reduced ? " (DPI reduzido para caber no navegador)" : ""));
        }
        setPlotterOpen(false);
        return;
      }
      const files: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      const warnings: string[] = [];
      let n = 0;
      setExpProgress({ done: 0, total: count });
      for (const s of sizes) for (const v of views) {
        if (sig.cancelled) return flashSaved("Exportação cancelada", 3000);
        const { svg, cmW, cmH } = buildPlotterSvgFor({ view: v, size: s, hideTechnical: hideTech, crop: cropRect });
        const name = uniqueName(`${exportName(clothingType, s, v)}.${ext}`, used);
        const r = await renderPiece(svg, cmW, cmH, exportFmt, expDpi, expQuality, name);
        if (r.reduced) warnings.push(`${sizeLabel(clothingType, s)} ${partLabel(v)} a ${r.dpi} DPI`);
        files[name] = r.bytes;
        n++;
        setExpProgress({ done: n, total: count });
        await yieldFrame();
      }
      if (sig.cancelled) return flashSaved("Exportação cancelada", 3000);
      const zip = await zipFiles(files, exportFmt);
      if (sig.cancelled) return flashSaved("Exportação cancelada", 3000);
      downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `MoldeCore_${clothingType.replace(/\s+/g, "_")}_${todayStamp()}.zip`);
      flashSaved(`${n} arquivos ${exportFmt.toUpperCase()} no ZIP` + (warnings.length ? ` · DPI reduzido: ${warnings.join(", ")}` : ""), warnings.length ? 9000 : 4500);
      setPlotterOpen(false);
    } catch {
      flashSaved("Não foi possível gerar o arquivo de exportação", 3500);
    } finally {
      setExporting(false);
      setExpProgress(null);
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
      <div
        className={
          "shrink-0 flex overflow-hidden transition-[width] duration-300 ease-in-out " +
          (sidebars.left ? "w-64" : "w-0")
        }
        inert={!sidebars.left}
      >
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
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      ["pdf", "PDF", "Vetor 1:1"],
                      ["png", "PNG", "Imagem"],
                      ["jpeg", "JPEG", "Imagem leve"],
                    ] as const).map(([k, l, d]) => (
                      <button
                        key={k}
                        onClick={() => setExportFmt(k)}
                        className={
                          "px-2 py-2 rounded-md border text-xs text-center transition-colors " +
                          (exportFmt === k ? "border-cyan/50 bg-cyan/10 text-cyan font-semibold" : "border-line text-muted-foreground hover:text-foreground")
                        }
                      >
                        {l}
                        <span className="block text-[10px] font-mono text-faint font-normal">{d}</span>
                      </button>
                    ))}
                  </div>
                  {exportFmt !== "pdf" && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-20">Resolução</span>
                        <div className="flex gap-1">
                          {TEAM_DPIS.map((d) => (
                            <button
                              key={d}
                              onClick={() => setExpDpi(d)}
                              className={"px-2 py-1 rounded border text-[11px] font-mono " + (expDpi === d ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-line text-muted-foreground")}
                            >
                              {d}
                            </button>
                          ))}
                          <span className="self-center text-[10px] text-faint">DPI</span>
                        </div>
                      </div>
                      {exportFmt === "jpeg" && (
                        <label className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-20">Qualidade</span>
                          <input type="range" min={60} max={100} value={expQuality} onChange={(e) => setExpQuality(+e.target.value)} className="flex-1 accent-cyan" />
                          <span className="font-mono text-[11px] w-9 text-right">{expQuality}%</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint mb-2">O que exportar</div>
                  {(
                    [
                      {
                        title: "Tamanhos",
                        mode: expSizeMode,
                        setMode: setExpSizeMode as (m: string) => void,
                        opts: [["atual", `Apenas o atual (${sizeLabel(clothingType, size)})`], ["todos", "Todos"], ["escolher", "Escolher…"]],
                        items: sizesForGarment(clothingType).map((o) => ({ id: o.id as string, label: o.label })),
                        sel: expSizes as string[],
                        toggle: (id: string) => setExpSizes((a) => (a.includes(id as Size) ? a.filter((x) => x !== id) : [...a, id as Size])),
                      },
                      {
                        title: "Vistas",
                        mode: expViewMode,
                        setMode: setExpViewMode as (m: string) => void,
                        opts: [["atual", "Apenas a atual"], ["todas", "Todas"], ["escolher", "Escolher…"]],
                        items: VIEWS.map((v) => ({ id: v.key as string, label: v.label })),
                        sel: expViews as string[],
                        toggle: (id: string) => setExpViews((a) => (a.includes(id as View) ? a.filter((x) => x !== id) : [...a, id as View])),
                      },
                    ]
                  ).map((g) => (
                    <div key={g.title} className="mb-2">
                      <div className="text-xs text-muted-foreground mb-1">{g.title}</div>
                      <div className="flex flex-wrap gap-1">
                        {g.opts.map(([k, l]) => (
                          <button
                            key={k}
                            onClick={() => g.setMode(k!)}
                            className={"px-2 py-1 rounded border text-[11px] " + (g.mode === k ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-line text-muted-foreground")}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      {g.mode === "escolher" && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {g.items.map((it) => (
                            <label key={it.id} className="flex items-center gap-1 text-[11px] cursor-pointer">
                              <input type="checkbox" checked={g.sel.includes(it.id)} onChange={() => g.toggle(it.id)} className="accent-cyan" />
                              {it.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
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

                {(() => {
                  const t = exportTargets();
                  const multi = t.count > 1;
                  const vector = exportFmt === "pdf" && !multi;
                  const mp = exportMaxPiece();
                  const d = fitDpi(mp.cmW, mp.cmH, expDpi);
                  return (
                    <div className="rounded-md border border-line bg-panel2 p-2.5 text-[10px] font-mono text-muted-foreground leading-snug space-y-1">
                      <div>
                        SAÍDA · {t.count} {t.count === 1 ? "arquivo" : "arquivos"} {exportFmt.toUpperCase()}
                        {multi ? " em ZIP" : ""} · {vector ? "vetor 1:1" : `maior peça ${fmt(mp.cmW)} × ${fmt(mp.cmH)} cm · ${cmToPx(mp.cmW, d)} × ${cmToPx(mp.cmH, d)} px`}
                        {!vector && d < expDpi ? ` · DPI reduzido para ${d}` : ""}
                      </div>
                      {exportFmt === "pdf" && multi && (
                        <div className="text-faint">PDF em lote usa imagem de alta resolução; para PDF vetorial exporte um arquivo por vez</div>
                      )}
                      {expProgress && (
                        <div className="pt-1">
                          <div className="h-1.5 rounded bg-line overflow-hidden">
                            <div className="h-full bg-cyan transition-all" style={{ width: `${(expProgress.done / Math.max(1, expProgress.total)) * 100}%` }} />
                          </div>
                          <div className="mt-1">{expProgress.done} / {expProgress.total}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="px-4 py-3 border-t border-line flex gap-2">
                <button
                  onClick={() => {
                    if (exporting) expSignal.current.cancelled = true;
                    else setPlotterOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-md border border-line text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={runExport}
                  disabled={exporting || exportTargets().count === 0}
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
      </div>

      {/* ============ PRINCIPAL ============ */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-line bg-panel flex items-center justify-between px-6 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SidebarToggle
              label={sidebars.left ? "Recolher barra lateral esquerda" : "Mostrar barra lateral esquerda"}
              Icon={sidebars.left ? PanelLeftClose : PanelLeftOpen}
              onClick={() => toggleSidebar("left")}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line bg-panel2 text-xs font-medium text-foreground hover:text-cyan hover:bg-cyan/10">
                  <FileText className="size-3.5" /> Arquivo <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuItem onSelect={() => void newProject()}>Novo projeto</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void openProject()}>Abrir projeto…<DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void saveProject(false)}>Salvar<DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void saveProject(true)}>Salvar como…<DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm font-medium text-foreground truncate max-w-[180px]" title={dirty ? "Alterações não salvas" : "Projeto salvo"}>
              {projectName}{dirty && <span className="text-amber-600 ml-1" aria-label="alterações não salvas">•</span>}
            </span>
            {askUnsaved && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/30">
                <div className="w-[380px] rounded-lg border border-line bg-panel p-5 shadow-xl">
                  <h2 className="text-sm font-semibold text-foreground">Alterações não salvas</h2>
                  <p className="mt-2 text-sm text-muted-foreground">O projeto "{projectName}" tem alterações não salvas. Deseja salvar antes de continuar?</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => askUnsaved("cancel")} className="h-8 px-3 rounded-md border border-line text-xs">Cancelar</button>
                    <button type="button" onClick={() => askUnsaved("discard")} className="h-8 px-3 rounded-md border border-line text-xs text-destructive">Descartar</button>
                    <button type="button" onClick={() => askUnsaved("save")} className="h-8 px-3 rounded-md bg-cyan text-xs font-semibold text-primary-foreground">Salvar</button>
                  </div>
                </div>
              </div>
            )}
            <span className="text-faint">/</span>
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
          <SidebarToggle
            label={sidebars.right ? "Recolher barra lateral direita" : "Mostrar barra lateral direita"}
            Icon={sidebars.right ? PanelRightClose : PanelRightOpen}
            onClick={() => toggleSidebar("right")}
          />
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
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void (async () => {
                    for (const [i, f] of fs.entries()) await onImport(f, fs.length > 1 ? { x: 0.5 + i * 0.03, y: 0.4 + i * 0.03 } : undefined);
                  })();
                }}
              />
              <button
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap bg-cyan text-primary-foreground hover:bg-cyan/90"
              >
                <FileUp className="size-3.5" /> Importar
              </button>
              <button
                onClick={() => setTeamOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border ${teamOpen ? "bg-cyan/10 border-cyan text-cyan" : "border-border text-foreground hover:bg-muted"}`}
              >
                <Users className="size-3.5" /> Time{roster.length > 0 && ` (${roster.length})`}
              </button>
              <TeamPanel
                open={teamOpen}
                onClose={() => setTeamOpen(false)}
                roster={roster}
                setRoster={setRoster}
                options={sizesForGarment(clothingType)}
                garment={clothingType}
                viewingId={teamView?.id ?? null}
                onView={(p) => startTeamView(p.id)}
                teamViews={(["frente", "costas", "mangaEsq", "mangaDir"] as View[]).filter((v) => texts[v].some((t) => t.field === "nome" || t.field === "numero"))}
                onExportTeam={exportTeam}
                measurePieces={teamMaxPiece}
                labelOf={(s) => sizesForGarment(clothingType).find((o) => o.id === s)?.label ?? s}
              />
              {(art || hasClipped || (selObj && !selObj.clipped)) && ((() => {
                const freeSel: "layer" | "art" | null = !pcEdit && selObj && !selObj.clipped ? "layer" : !pcEdit && selPart === "estampa" && !!art && art.clipped === false ? "art" : null;
                return (
                <>
                  <button
                    onClick={() => {
                      if (pcEdit) return pcApply();
                      if (freeSel === "layer" && selObj) return layerToPowerClip(selObj.id);
                      if (freeSel === "art") return pcApply();
                      if (pcHasContent) return pcEditStart();
                      if (art && art.clipped === false) return pcApply();
                    }}
                    className={
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border " +
                      (pcEdit ? "border-amber/60 text-amber bg-amber/10" : "border-line text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Crop className="size-3.5" />
                    {pcEdit ? "Concluir Edição" : freeSel ? "Aplicar PowerClip" : pcHasContent ? "Editar Conteúdo do PowerClip" : "Aplicar PowerClip"}
                  </button>
                  {!!art && <button
                    onClick={() => setArt(null)}
                    aria-label="Remover estampa"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>}
                </>
                );
              })())}
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
                {pcPick && (
                  <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary bg-panel px-3 py-1.5 text-xs font-medium text-primary shadow">
                    Clique na borda do retângulo para inserir o PowerClip · Esc cancela
                  </div>
                )}
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
                  onPowerClipArt={pcApply}
                  onPowerClipLayer={layerToPowerClip}
                  pcPick={pcPick}
                  onPcPickChange={setPcPick}
                  onEditImage={() => setImgEditOpen(true)}
                  mother={mother}
                  pcEdit={pcEdit}
                  partStyle={styles[view]}
                  onMenu={(x, y) => setMenu({ x, y })}
                  layers={curLayers}
                  selLayer={selLayer}
                  onSelLayer={selectLayer}
                  selText={selText}
                  onSelText={selectText}
                  onLayersChange={(arr) => setViewLayers(arr)}
                  drawOpts={drawOpts}
                  showSeam={showSeam}
                  showBleed={showBleed}
                  showSafety={showSafety}
                  selPart={selPart}
                  onSelPart={selectPart}
                  lockRatio={lockRatio}
                  onPieceDims={setPieceDims}
                  texts={texts}
                  onTextsChange={setTexts}
                  onCheckpoint={checkpoint}
                  teamPreview={teamPreviewTexts}
                />
                {viewPlayer && (
                  <div className="absolute top-3 left-1/2 z-30 -translate-x-1/2 flex items-center gap-1.5 rounded-md border border-cyan bg-panel px-2 py-1 text-xs shadow" role="status">
                    <button onClick={() => stepPlayer(-1)} aria-label="Jogador anterior" className="p-1 rounded hover:bg-muted"><ChevronLeft className="size-3.5" /></button>
                    <span className="font-medium text-foreground">
                      Visualizando: {viewPlayer.numero || "—"} · {viewPlayer.nome || "(sem nome)"} ({sizesForGarment(clothingType).find((o) => o.id === viewPlayer.tamanho)?.label ?? viewPlayer.tamanho})
                    </span>
                    {teamPreview?.overflow && <span className="text-destructive font-medium">⚠ O nome passa da largura da peça — defina a largura máxima do campo</span>}
                    <button onClick={() => stepPlayer(1)} aria-label="Próximo jogador" className="p-1 rounded hover:bg-muted"><ChevronRight className="size-3.5" /></button>
                    <button onClick={exitTeamView} className="ml-1 px-2 py-0.5 rounded bg-cyan text-primary-foreground hover:bg-cyan/90">Sair</button>
                  </div>
                )}
                <div id="text-panel-host" className="pointer-events-none absolute inset-0 z-20" />
                {(tool === "caneta" || tool === "formas") && <DrawOptionsPanel mode={tool} opts={drawOpts} onChange={setDrawOpts} />}
                {showPcEditor && pcTarget && (
                  <PowerClipEditor
                    key={selClippedLayer?.id ?? "estampa"}
                    art={pcTarget}
                    frame={pcFrame}
                    W={pieceW}
                    H={pieceH}
                    fileBase={pcFileBase}
                    onChange={pcTargetChange}
                    onRemove={pcRemove}
                    onExtract={pcExtractSelected}
                    onClose={() => {
                      setSelLayer(null);
                      setSelPart(null);
                    }}
                    features={
                      selClippedLayer
                        ? { flip: false, opacity: false, replace: !!selClippedLayer.src, reset: !!selClippedLayer.init }
                        : {}
                    }
                  />
                )}
                {imgEditOpen && art && (
                  <ImageEditorModal
                    src={art.src}
                    onCancel={() => setImgEditOpen(false)}
                    onSave={(src, ratio) => {
                      setImgEditOpen(false);
                      setArt({ ...art, src, ratio });
                    }}
                  />
                )}
                {selInfo && (
                  <SelectionPropsBar info={selInfo} locked={lockRatio} onToggleLock={() => setLockRatio((v) => !v)} />
                )}
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
                              selectLayer(l.id);
                              if (tool !== "forma") setTool("selecao");
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              selectLayer(l.id);
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
                            {l.clipped && <span className="shrink-0 rounded bg-cyan/15 px-1 text-[9px] font-mono uppercase text-cyan">PowerClip</span>}
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
                  <span>{pcState === "editing" ? (pcTarget ? "Editando conteúdo do PowerClip · arraste o item e a alça do canto · clique em Concluir Edição para travar" : "Editando PowerClip · clique em um item para editá-lo · Concluir Edição trava") : TOOL_HINTS[tool]}</span>
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

          {menu &&
            createPortal(
              <CanvasContextMenu
                x={menu.x}
                y={menu.y}
                disabled={!selObj}
                deleteDisabled={!canDeleteSelection}
                onCut={cutSelectedLayer}
                onCopy={copySelectedLayer}
                onPaste={pasteLayer}
                onDelete={() => deleteSelection(true)}
                onBringForward={() => moveSelectedLayer("front")}
                onSendBackward={() => moveSelectedLayer("back")}
                onClose={() => setMenu(null)}
                sections={[
                  {
                    title: "PowerClip",
                    items: [
                      selObj && !selObj.clipped
                        ? { label: "Inserir no PowerClip", run: () => setPcPick(selObj.id) }
                        : artFree
                          ? { label: "Inserir no PowerClip", run: () => { setSelPart("estampa"); setTimeout(() => setPcPick("art"), 0); } }
                          : null,
                      pcHasContent && !pcEdit ? { label: "Editar Conteúdo do PowerClip", run: pcEditStart } : null,
                      pcEdit ? { label: "Concluir Edição", run: pcApply } : null,
                      pcEdit && pcHasContent ? { label: "Extrair Selecionado", run: pcExtractSelected, disabled: !canExtractSelected } : null,
                      pcHasContent ? { label: "Extrair Tudo", run: pcExtractAll } : null,
                    ].filter((i): i is CtxItem => !!i),
                  },
                  {
                    title: "Objeto",
                    items: selObj?.kind === "vetor" ? [{ label: "Converter em contorno da peça", run: () => layerToOutline(selObj.id) }] : [],
                  },
                  {
                    title: "Arquivo",
                    items: [
                      { label: "Importar Arquivo…", run: () => importRef.current?.click() },
                      ...(art ? [{ label: "Remover Estampa", run: () => setArt(null) }] : []),
                    ],
                  },
                ]}
              />,
              document.body,
            )}

          {/* ============ PAINEL DIREITO ============ */}
          <div
            className={
              "shrink-0 flex justify-end overflow-hidden transition-[width] duration-300 ease-in-out " +
              (sidebars.right ? "w-80" : "w-0")
            }
            inert={!sidebars.right}
          >
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
        </div>
      </main>

      {/* Coluna própria no layout: a paleta não cobre mais o painel direito nem o cabeçalho. */}
      <PaletteDock target={colorTarget} onTarget={setColorTarget} onApply={applyColor} current={colorCurrent} targetLabel={colorLabel} targetKind={colorKind} />
    </div>
  );
}

type SelectionInfo = { label: string; w: number; h: number; set: (w: number, h: number) => void };

/* Barra de propriedades da Ferramenta Seleção: largura, altura e cadeado de proporção. */
function SelectionPropsBar({ info, locked, onToggleLock }: { info: SelectionInfo; locked: boolean; onToggleLock: () => void }) {
  const LockIcon = locked ? Lock : LockOpen;
  const setW = (w: number) => info.set(w, locked ? (w * info.h) / info.w : info.h);
  const setH = (h: number) => info.set(locked ? (h * info.w) / info.h : info.w, h);
  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 shadow-lg text-xs">
      <span className="max-w-40 truncate font-medium text-foreground" title={info.label}>
        {info.label}
      </span>
      <span className="h-5 w-px bg-line" />
      <DimField label="L" title="Largura (cm)" value={info.w} onCommit={setW} />
      <button
        type="button"
        onClick={onToggleLock}
        aria-pressed={locked}
        aria-label={locked ? "Proporção travada" : "Proporção livre"}
        title={locked ? "Proporção travada: largura e altura mudam juntas" : "Proporção livre: largura e altura independentes"}
        className={
          "grid size-7 place-items-center rounded-md border transition-colors " +
          (locked ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-line text-muted-foreground hover:text-foreground")
        }
      >
        <LockIcon className="size-3.5" />
      </button>
      <DimField label="A" title="Altura (cm)" value={info.h} onCommit={setH} />
    </div>
  );
}

function DimField({ label, title, value, onCommit }: { label: string; title: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(v) && v >= MIN_SIZE_CM && Math.abs(v - value) > 1e-6) onCommit(v);
  };
  return (
    <label className="flex items-center gap-1.5" title={title}>
      <span className="font-mono text-[10px] text-faint">{label}</span>
      <input
        inputMode="decimal"
        aria-label={title}
        value={draft ?? fmt(value)}
        onFocus={(e) => {
          setDraft(fmt(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
        className="h-7 w-16 rounded-md border border-line bg-panel2 px-2 text-right font-mono text-xs text-foreground focus:border-cyan focus:outline-none"
      />
      <span className="font-mono text-[10px] text-faint">cm</span>
    </label>
  );
}

function SidebarToggle({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: typeof PanelLeftClose;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-line hover:bg-panel2 hover:text-cyan"
    >
      <Icon className="size-4" />
    </button>
  );
}

/* ================= Canvas SVG ================= */

type Pt = { x: number; y: number };
type HandleDir = -1 | 0 | 1;
/* Camadas e estampas: centro normalizado, largura relativa à peça, proporção altura/largura e rotação. */
type BoxObject = { cx: number; cy: number; w: number; ratio: number; rot?: number };
/* As 8 alças da caixa de seleção (cantos e meios das bordas), como no CorelDRAW. */
const HANDLES: { hx: HandleDir; hy: HandleDir }[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 },
  { hx: -1, hy: 0 }, { hx: 1, hy: 0 },
  { hx: -1, hy: 1 }, { hx: 0, hy: 1 }, { hx: 1, hy: 1 },
];
const handleCursor = (hx: HandleDir, hy: HandleDir) =>
  !hx ? "cursor-ns-resize" : !hy ? "cursor-ew-resize" : hx === hy ? "cursor-nwse-resize" : "cursor-nesw-resize";
const MIN_SIZE_CM = 0.5;

/* Com o cadeado fechado, um único fator vale para os dois eixos: o do eixo que a alça
   controla ou, nos cantos, o que mais mudou. */
const lockFactor = (fx: number, fy: number, hx: HandleDir, hy: HandleDir) =>
  hx && hy ? (Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy) : hx ? fx : fy;

type Drag =
  | { k: "node"; i: number }
  | { k: "hOut"; i: number }
  | { k: "hIn"; i: number }
  | { k: "pen"; i: number }
  | { k: "free"; pts: Pt[]; sx: number; sy: number }
  | { k: "shape"; s: Pt; p: Pt; shift: boolean; alt: boolean }
  | { k: "art"; start: Pt; orig: Artwork }
  | { k: "move"; start: Pt; orig: Node[] }
  | { k: "pscale"; hx: HandleDir; hy: HandleDir; W: number; H: number }
  | { k: "bscale"; target: "layer" | "art"; hx: HandleDir; hy: HandleDir; orig: BoxObject }
  | { k: "pan"; sx: number; sy: number; orig: Pt; alt: boolean; at: Pt }
  | { k: "lmove"; start: Pt; orig: Layer }
  | { k: "lrot"; orig: Layer }
  | { k: "lnode"; id: string; pi: number; si: number; i: number; which: "n" | "hIn" | "hOut" };

function PatternCanvas({
  view,
  selText,
  onSelText,
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
  drawOpts = DEFAULT_DRAW_OPTS,
  showSeam = true,
  showBleed = true,
  showSafety = true,
  clothingType,
  selPart,
  onSelPart,
  lockRatio,
  onPieceDims,
  onPowerClipArt,
  onPowerClipLayer,
  pcPick = null,
  onPcPickChange = () => {},
  onEditImage,
  texts,
  onTextsChange,
  onCheckpoint,
  teamPreview = null,
}: {
  teamPreview?: TextElement[] | null;
  texts: TextsByView;
  onTextsChange: (t: TextsByView) => void;
  onCheckpoint: (key: string) => void;
  /** Duplo clique na arte dentro do PowerClip: abre o editor de imagem. */
  onEditImage?: () => void;
  /** Clique no retângulo da Plotter com a estampa livre selecionada. */
  onPowerClipArt: () => void;
  /** Clique no retângulo da Plotter com um objeto importado selecionado. */
  onPowerClipLayer: (id: string) => void;
  /** Alvo do modo "Inserir no PowerClip" (escolhido no menu do botão direito). */
  pcPick?: "art" | string | null;
  onPcPickChange?: (p: "art" | string | null) => void;
  clothingType: ClothingType;
  selPart: "peca" | "estampa" | null;
  onSelPart: (p: "peca" | "estampa" | null) => void;
  lockRatio: boolean;
  /** Novas medidas-base (cm) da vista ativa: alimentam a tabela, as cotas e as linhas técnicas. */
  onPieceDims: (w: number, h: number) => void;
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
  selText: string | null;
  onSelText: (id: string | null) => void;
  onLayersChange: (l: Layer[]) => void;
  drawOpts?: DrawOpts;
  showSeam?: boolean;
  showBleed?: boolean;
  showSafety?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const freeRef = useRef<Pt[]>([]);
  const [draft, setDraft] = useState<Node[] | null>(null);
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 });
  const [tape, setTape] = useState<{ a: Pt | null; b: Pt | null }>({ a: null, b: null });
  const [hover, setHover] = useState<Pt | null>(null);
  const [frameHover, setFrameHover] = useState(false);

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

  /* Redimensiona uma caixa (camada ou estampa) mantendo fixa a alça oposta, no referencial girado do objeto. */
  const resizeBox = <T extends BoxObject>(o: T, hx: HandleDir, hy: HandleDir, p: Pt): T => {
    const aw = o.w * W;
    const ah = aw * o.ratio;
    const c = toSvg({ x: o.cx, y: o.cy });
    const r = ((o.rot ?? 0) * Math.PI) / 180;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const lx = dx * Math.cos(r) + dy * Math.sin(r);
    const ly = -dx * Math.sin(r) + dy * Math.cos(r);
    const ax = (-hx * aw) / 2;
    const ay = (-hy * ah) / 2;
    let nw = hx ? Math.max(MIN_SIZE_CM, hx * (lx - ax)) : aw;
    let nh = hy ? Math.max(MIN_SIZE_CM, hy * (ly - ay)) : ah;
    if (lockRatio) {
      const f = lockFactor(nw / aw, nh / ah, hx, hy);
      nw = Math.max(MIN_SIZE_CM, aw * f);
      nh = nw * o.ratio;
    }
    const cl = { x: ax + (hx * nw) / 2, y: ay + (hy * nh) / 2 };
    const gc = { x: c.x + cl.x * Math.cos(r) - cl.y * Math.sin(r), y: c.y + cl.x * Math.sin(r) + cl.y * Math.cos(r) };
    const n = toNorm(gc);
    return { ...o, cx: n.x, cy: n.y, w: nw / W, ratio: nh / nw };
  };

  /* A peça é ancorada no eixo central e na linha do ombro (y = 0): a alça define a nova medida-base. */
  const resizePiece = (hx: HandleDir, hy: HandleDir, p: Pt, W0: number, H0: number) => {
    const ex = hx < 0 ? box.x0 - 0.5 : box.x1 - 0.5;
    const ey = hy < 0 ? box.y0 : box.y1;
    let nW = W0;
    let nH = H0;
    const canX = hx !== 0 && Math.abs(ex) > 1e-3 && Math.sign(p.x) === Math.sign(ex);
    const canY = hy !== 0 && Math.abs(ey) > 1e-3 && p.y > 0;
    if (canX) nW = p.x / ex;
    if (canY) nH = p.y / ey;
    if (lockRatio) {
      const f = lockFactor(nW / W0, nH / H0, canX ? hx : 0, canY ? hy : 0);
      nW = W0 * f;
      nH = H0 * f;
    }
    const minW = MIN_SIZE_CM / Math.max(1e-3, box.x1 - box.x0);
    const minH = MIN_SIZE_CM / Math.max(1e-3, box.y1 - box.y0);
    onPieceDims(Math.max(minW, nW), Math.max(minH, nH));
  };
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

  /* Desenhos da Caneta viram camadas vetoriais novas; o molde (shapes) nunca é alterado aqui. */
  const addDrawn = (cm: CmNode[], closed: boolean) => {
    const nodesCm = dedupe(cm);
    const l = layerFromCm(nodesCm, closed && nodesCm.length >= 3, { stroke: drawOpts.penStroke, fill: null, widthCm: drawOpts.penWidth }, nextName("Desenho", layers), W, H);
    if (!l) return;
    onLayersChange([...layers, l]);
    onSelLayer(l.id);
  };
  const commitDraft = (closed = false) => {
    if (draft && draft.length >= 2) {
      const cm: CmNode[] = draft.map((n, i) => {
        const o: CmNode = { x: (n.x - 0.5) * W, y: n.y * H, smooth: n.smooth && (closed || (i > 0 && i < draft.length - 1)) };
        if (n.hIn) o.hIn = { x: n.hIn.x * W, y: n.hIn.y * H };
        if (n.hOut) o.hOut = { x: n.hOut.x * W, y: n.hOut.y * H };
        if (n.hIn || n.hOut) o.smooth = n.smooth;
        return o;
      });
      addDrawn(cm, closed);
    }
    setDraft(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tool !== "caneta" || !draft) return;
      if (e.key === "Enter") commitDraft(false);
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* Retângulo da Plotter (mesma caixa da exportação: limites da Linha de Sangria).
     É o destino/máscara do PowerClip. */
  const frame = (() => {
    const bb =
      pathBounds(offsetPathD(buildPath(nodes, W, H), BLEED_OFFSET_CM, TECHNICAL_OFFSET_OPTIONS)) ?? {
        minX: -W / 2 - PLOTTER_MARGIN,
        minY: -PLOTTER_MARGIN,
        maxX: W / 2 + PLOTTER_MARGIN,
        maxY: H + PLOTTER_MARGIN,
      };
    return { x: bb.minX, y: bb.minY, w: Math.max(0.1, bb.maxX - bb.minX), h: Math.max(0.1, bb.maxY - bb.minY) };
  })();
  /* PowerClip armado: estampa livre selecionada ("art") ou imagem/vetor importado selecionado (id). */
  const pcPickValid =
    tool === "selecao" &&
    (pcPick === "art"
      ? !!artwork && artwork.clipped === false && size === mother
      : !!pcPick && !!selL && selL.id === pcPick && !selL.hidden);
  const pcArmed: "art" | string | null = pcPickValid ? pcPick : null;
  useEffect(() => {
    if (pcPick && !pcPickValid) onPcPickChange(null);
  }, [pcPick, pcPickValid]);
  const pcIndicator = (() => {
    if (!pcArmed) return null;
    let from: Pt;
    if (pcArmed === "art" && artwork) {
      const c = toSvg({ x: artwork.cx, y: artwork.cy });
      from = { x: c.x, y: c.y - (artwork.w * W * artwork.ratio) / 2 };
    } else if (selL) {
      const { c, ah } = lg(selL);
      from = { x: c.x, y: c.y - ah / 2 };
    } else return null;
    const tx = Math.min(frame.x + frame.w, Math.max(frame.x, from.x));
    const to = { x: tx, y: frame.y };
    const sy = Math.min(from.y, frame.y) - unit * 8;
    const head = unit * 1.6;
    return (
      <g className="pointer-events-none">
        <path
          d={`M ${from.x} ${from.y - unit} Q ${from.x} ${sy} ${(from.x + to.x) / 2} ${sy} T ${to.x} ${to.y - unit * 0.5}`}
          className="fill-none stroke-primary"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M ${to.x} ${to.y} l ${-head / 2} ${-head} l ${head} 0 Z`}
          className="fill-primary"
        />
        <text x={(from.x + to.x) / 2} y={sy - unit} textAnchor="middle" fontSize={unit * 1.3} className="fill-primary font-mono font-bold">
          Clique no retângulo para colocar esta arte dentro dele.
        </text>
      </g>
    );
  })();

  const box = {
    x0: Math.min(...nodes.map((n) => n.x)),
    y0: Math.min(...nodes.map((n) => n.y)),
    x1: Math.max(...nodes.map((n) => n.x)),
    y1: Math.max(...nodes.map((n) => n.y)),
  };

  const onBgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e);
    if ((tool === "selecao" || tool === "forma") && e.button === 0) {
      onSelLayer(null);
      onSelPart(null);
      onSelText(null);
    }
    if (tool === "zoom") {
      capture(e);
      setDrag({ k: "pan", sx: e.clientX, sy: e.clientY, orig: { x: zoom.px, y: zoom.py }, alt: e.altKey, at: p });
    } else if (tool === "fita") {
      setTape((t) => (!t.a || t.b ? { a: p, b: null } : { a: t.a, b: p }));
    } else if (tool === "caneta") {
      if (e.button !== 0) return;
      if (draft && draft.length >= 3) {
        const f = toSvg(draft[0]!);
        if (Math.hypot(f.x - p.x, f.y - p.y) < unit * 1.5) {
          commitDraft(true);
          return;
        }
      }
      capture(e);
      if (drawOpts.penMode === "livre") {
        freeRef.current = [p];
        setDrag({ k: "free", pts: [p], sx: e.clientX, sy: e.clientY });
        return;
      }
      const n = toNorm(p);
      const next = [...(draft ?? []), { x: n.x, y: n.y, smooth: false }];
      setDraft(next);
      setDrag({ k: "pen", i: next.length - 1 });
    } else if (tool === "formas") {
      if (e.button !== 0) return;
      capture(e);
      setDrag({ k: "shape", s: p, p, shift: e.shiftKey, alt: e.altKey });
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
      case "bscale": {
        const next = resizeBox(drag.orig, drag.hx, drag.hy, p);
        if (drag.target === "art") onArtworkChange(next as Artwork);
        else setLayer(next as Layer);
        break;
      }
      case "pscale":
        resizePiece(drag.hx, drag.hy, p, drag.W, drag.H);
        break;
      case "lmove":
        setLayer({ ...drag.orig, cx: drag.orig.cx + n.x - drag.start.x, cy: drag.orig.cy + n.y - drag.start.y });
        break;
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
      case "free": {
        const fp = freeRef.current;
        const l = fp[fp.length - 1]!;
        if (Math.hypot(l.x - p.x, l.y - p.y) > unit * 0.1) {
          fp.push(p);
          setDrag({ ...drag, pts: fp.slice() });
        }
        break;
      }
      case "shape":
        setDrag({ ...drag, p, shift: e.shiftKey, alt: e.altKey });
        break;
      case "move": {
        const dx = n.x - drag.start.x;
        const dy = n.y - drag.start.y;
        setNodes(drag.orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })));
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
    if (drag?.k === "free") {
      const fpts = freeRef.current;
      const moved = fpts.length > 2 || (fpts.length > 1 && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= 4);
      if (!moved) {
        const n = toNorm(fpts[0]!);
        setDraft([...(draft ?? []), { x: n.x, y: n.y, smooth: false }]);
      } else {
        const simp = rdp(fpts, unit * 0.4);
        if (draft && draft.length) {
          const add = simp.slice(1).map((q) => ({ ...toNorm(q), smooth: true }));
          setDraft([...draft, ...add]);
        } else {
          const f = simp[0]!;
          const l = simp[simp.length - 1]!;
          const closed = simp.length >= 3 && Math.hypot(f.x - l.x, f.y - l.y) < unit * 1.5;
          const pts = closed ? simp.slice(0, -1) : simp;
          const cm = pts.map((q, i) => ({ x: q.x, y: q.y, smooth: closed || (i > 0 && i < pts.length - 1) }));
          addDrawn(cm, closed && cm.length >= 3);
        }
      }
    }
    if (drag?.k === "shape") {
      const r = dragRect(drag.s, drag.p, drag.shift, drag.alt);
      if (Math.max(r.w, r.h) >= 0.3) {
        const sh = shapeNodes(drawOpts.shape, r);
        const l = layerFromCm(
          sh.nodes,
          sh.closed,
          { stroke: drawOpts.shapeStroke, fill: drawOpts.shapeFill, widthCm: drawOpts.shapeWidth },
          nextName(SHAPE_LABELS[drawOpts.shape], layers),
          W,
          H,
        );
        if (l) {
          onLayersChange([...layers, l]);
          onSelLayer(l.id);
        }
      }
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
    if (tool === "caneta") {
      if (draft) commitDraft(false);
      return;
    }
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
  const showNodes = tool === "forma" && !layerNodeMode;
  const nodesInteractive = tool === "forma";
  const cursor = { selecao: "cursor-default", forma: "cursor-crosshair", caneta: "cursor-crosshair", formas: "cursor-crosshair", zoom: "cursor-zoom-in", fita: "cursor-crosshair", texto: "cursor-text" }[tool];
  const tapeEnd = tape.b ?? (tape.a ? hover : null);
  const sw = { strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };

  /* Caixa de seleção com 8 alças, em coordenadas locais centradas no objeto. */
  const selectionBox = (
    aw: number,
    ah: number,
    color: "amber" | "cyan",
    onHandle: (e: React.PointerEvent, hx: HandleDir, hy: HandleDir) => void,
    skip?: (hx: HandleDir, hy: HandleDir) => boolean,
  ) => (
    <>
      <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} className={`fill-none stroke-${color} pointer-events-none`} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      {HANDLES.filter(({ hx, hy }) => !skip?.(hx, hy)).map(({ hx, hy }) =>
        square({ x: (hx * aw) / 2, y: (hy * ah) / 2 }, `h${hx}${hy}`, `fill-garment stroke-${color} ${handleCursor(hx, hy)}`, (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          capture(e);
          onHandle(e, hx, hy);
        }),
      )}
    </>
  );

  const content = (l: Layer, aw: number, ah: number, hit: boolean) =>
    l.src ? (
      <image href={l.src} x={-aw / 2} y={-ah / 2} width={aw} height={ah} preserveAspectRatio="none" />
    ) : (
      <>
        {hit && <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} fill="transparent" />}
        <g transform={`translate(0 ${-ah / 2})`}>
          {l.paths!.map((p, pi) => {
            const d = layerPathD(p, aw, ah);
            return (
              <g key={pi}>
                {hit && <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(p.sw * aw, unit * 1.2)} style={{ pointerEvents: "stroke" }} />}
                <path d={d} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.sw * aw} fillRule={p.rule} />
              </g>
            );
          })}
        </g>
      </>
    );

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
      onPointerDownCapture={() => {
        const a = document.activeElement as HTMLElement | null;
        if (a && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA")) a.blur();
      }}
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
          onSelPart("peca");
          if (e.button !== 0) return;
          capture(e);
          setDrag({ k: "move", start: toNorm(svgPoint(e)), orig: nodes });
        }}
      />

      {/* PowerClip: a máscara é sempre o retângulo da Plotter. */}
      <clipPath id="outline-clip">
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      </clipPath>
      {artwork && (() => {
        const aw = artwork.w * W;
        const ah = aw * artwork.ratio;
        const c = toSvg({ x: artwork.cx, y: artwork.cy });
        const clipped = artwork.clipped !== false;
        const editingNow = clipped && pcEdit && size === mother;
        // Com PowerClip aplicado, a arte só é interativa durante "Editar Conteúdo do PowerClip".
        const movable = size === mother && tool === "selecao";
        const imgProps = {
          href: artwork.src,
          x: c.x - aw / 2,
          y: c.y - ah / 2,
          width: aw,
          height: ah,
          preserveAspectRatio: "none",
          transform: artTransform(artwork, c.x, c.y),
        };
        const down = (e: React.PointerEvent) => {
          e.stopPropagation();
          onSelPart("estampa");
          if (e.button !== 0) return;
          capture(e);
          setDrag({ k: "art", start: toNorm(svgPoint(e)), orig: artwork });
        };
        const artSelected = movable && selPart === "estampa" && (!clipped || editingNow);
        return (
          <g>
            {/* PowerClip: a máscara é o retângulo da Plotter, nunca as linhas do molde. */}
            {(!clipped || editingNow) && (
              <image
                {...imgProps}
                opacity={editingNow ? 0.3 : 1}
                className={movable ? "cursor-move" : ""}
                style={{ pointerEvents: movable ? "all" : "none" }}
                onPointerDown={movable ? down : undefined}
                onDoubleClick={editingNow && movable ? (e) => { e.stopPropagation(); onEditImage?.(); } : undefined}
              />
            )}
            {clipped && (
              <g clipPath="url(#outline-clip)">
                <image {...imgProps} opacity={artwork.opacity ?? 1} style={{ pointerEvents: "none" }} />
              </g>
            )}
            {artSelected && (
              <g transform={`translate(${c.x} ${c.y}) rotate(${artwork.rot ?? 0})`}>
                {selectionBox(aw, ah, "amber", (_, hx, hy) => setDrag({ k: "bscale", target: "art", hx, hy, orig: artwork }))}
              </g>
            )}
            {(artSelected || !clipped) && (
              <text x={c.x} y={c.y - ah / 2 - unit} textAnchor="middle" fontSize={unit * 1.2} className="fill-amber font-mono pointer-events-none">
                {fmt(aw)} × {fmt(ah)} cm · {Math.round(artwork.w * 100)}% da largura{size !== mother ? ` · auto de ${mother}` : ""}
              </text>
            )}
          </g>
        );
      })()}

      {/* Objetos importados (camadas); recortadas ficam dentro do PowerClip */}
      {layers.map((l) => {
        if (l.hidden) return null;
        const { c, aw, ah } = lg(l);
        const sel = l.id === selLayer;
        const pickable = (tool === "selecao" || tool === "forma") && (!l.clipped || pcEdit);
        const down = (e: React.PointerEvent) => {
          if (!pickable && e.button !== 2) return;
          e.stopPropagation();
          onSelLayer(l.id);
          if (e.button !== 0 || tool !== "selecao") return;
          capture(e);
          setDrag({ k: "lmove", start: toNorm(svgPoint(e)), orig: l });
        };
        return (
          <g key={l.id} clipPath={l.clipped && !pcEdit ? "url(#outline-clip)" : undefined}>
          {l.clipped && pcEdit && (
            <g clipPath="url(#outline-clip)" style={{ pointerEvents: "none" }}>
              <g transform={`translate(${c.x} ${c.y}) rotate(${l.rot})`}>{content(l, aw, ah, false)}</g>
            </g>
          )}
          <g transform={`translate(${c.x} ${c.y}) rotate(${l.rot})`}>
            <g
              className={tool === "selecao" && pickable ? "cursor-move" : ""}
              style={{ pointerEvents: pickable ? "all" : "none" }}
              opacity={l.clipped && pcEdit ? 0.3 : undefined}
              onPointerDown={down}
            >
              {content(l, aw, ah, true)}
            </g>
            {sel && tool !== "selecao" && (
              <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} className="fill-none stroke-amber pointer-events-none" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
            {sel && tool === "selecao" && (
              <>
                {selectionBox(aw, ah, "amber", (_, hx, hy) => setDrag({ k: "bscale", target: "layer", hx, hy, orig: l }))}
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
          const { x: fx, y: fy, w: fw, h: fh } = frame;
          return (
            <>
              <rect
                x={fx}
                y={fy}
                width={fw}
                height={fh}
                className={"fill-none " + (pcArmed && frameHover ? "stroke-primary" : "stroke-ink")}
                strokeWidth={pcArmed && frameHover ? 4 : 2}
                vectorEffect="non-scaling-stroke"
              />
              {pcArmed && (
                <>
                  {/* Área de clique do destino: só a borda do retângulo (as linhas do molde não disparam o PowerClip). */}
                  <rect
                    x={fx}
                    y={fy}
                    width={fw}
                    height={fh}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-copy"
                    style={{ pointerEvents: "stroke" }}
                    onPointerEnter={() => setFrameHover(true)}
                    onPointerLeave={() => setFrameHover(false)}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      setFrameHover(false);
                      if (pcArmed === "art") {
                        onPowerClipArt();
                        onSelPart(null);
                      } else onPowerClipLayer(pcArmed);
                      onPcPickChange(null);
                    }}
                  />
                  {pcIndicator}
                </>
              )}
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
      {tool === "selecao" && selPart === "peca" && (() => {
        const a = toSvg({ x: box.x0, y: box.y0 });
        const b = toSvg({ x: box.x1, y: box.y1 });
        return (
          <g transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`}>
            {selectionBox(
              b.x - a.x,
              b.y - a.y,
              "cyan",
              (_, hx, hy) => setDrag({ k: "pscale", hx, hy, W, H }),
              // A linha do ombro é a âncora da peça: a borda superior não muda a altura.
              (hx, hy) => hx === 0 && hy === -1 && box.y0 < 1e-3,
            )}
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

      {/* Prévia do traço à mão livre */}
      {drag?.k === "free" && drag.pts.length > 1 && (
        <path
          d={drag.pts.map((q, i) => `${i ? "L" : "M"} ${q.x} ${q.y}`).join(" ")}
          className="fill-none stroke-amber pointer-events-none"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Prévia da forma */}
      {drag?.k === "shape" && (() => {
        const sh = shapeNodes(drawOpts.shape, dragRect(drag.s, drag.p, drag.shift, drag.alt));
        const pl = layerFromCm(sh.nodes, sh.closed, { stroke: drawOpts.shapeStroke, fill: drawOpts.shapeFill, widthCm: drawOpts.shapeWidth }, "", W, H);
        if (!pl?.paths) return null;
        const { c, aw, ah } = lg(pl);
        const pp = pl.paths[0]!;
        return (
          <g className="pointer-events-none" transform={`translate(${c.x} ${c.y - ah / 2})`}>
            <path d={layerPathD(pp, aw, ah)} fill={pp.fill ?? "none"} fillOpacity={0.6} stroke="var(--color-amber, #f59e0b)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })()}


      <TextWorkspace tool={tool} view={view} svgPoint={svgPoint} bounds={{ x: vx, y: vy, width: vw, height: vh }} texts={texts} setTexts={onTextsChange} checkpoint={onCheckpoint} selectedId={selText} onSelect={onSelText} unit={unit} selectionBox={selectionBox} preview={teamPreview} />

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
  targetLabel,
  targetKind,
}: {
  target: ColorTarget;
  onTarget: (t: ColorTarget) => void;
  onApply: (t: ColorTarget, hex: string | null) => void;
  current: { stroke: string | null; fill: string | null; mixedFill?: boolean; mixedStroke?: boolean };
  targetLabel: string;
  targetKind: "vetor" | "texto" | "imagem" | "molde";
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
        className="sticky top-0 z-30 flex h-screen w-10 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel pt-3 text-muted-foreground shadow-lg transition-colors hover:text-cyan"
      >
        <Palette className="size-4" />
        <span className="[writing-mode:vertical-rl] text-[10px] font-mono uppercase tracking-[0.2em]">Paleta</span>
      </button>
    );

  return (
    <div className="sticky top-0 z-30 flex h-screen w-14 shrink-0 flex-col border-l border-line bg-panel shadow-lg">
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

        <div className="rounded border border-line bg-panel2 px-1 py-1 text-[9px] leading-tight text-muted-foreground break-words" title={targetLabel}>
          Aplicando em: <span className="text-foreground font-semibold">{targetLabel}</span>
          {targetKind === "imagem" && <div className="mt-0.5 text-faint">Esta imagem não tem cor de preenchimento</div>}
        </div>
        <div className="space-y-1">
          {(
            [
              ["contorno", "Contorno"],
              ["preenchimento", "Preenchimento"],
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
                    ? current.mixedStroke
                      ? { borderStyle: "dashed" }
                      : { borderColor: current.stroke ?? "var(--color-cyan)" }
                    : current.mixedFill
                      ? { borderStyle: "dashed", background: "transparent" }
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
