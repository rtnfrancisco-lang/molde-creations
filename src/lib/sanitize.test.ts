import { describe, expect, it } from "vitest";
import { buildProjectFile, parseProjectFile, type ProjectData } from "./project-file";
import {
  cor,
  safeImageSrc,
  sanitizeArtworks,
  sanitizeGrading,
  sanitizeLayers,
  sanitizeShapes,
  sanitizeStyles,
  sanitizeTexts,
  summarizeIssues,
  type SNode,
} from "./sanitize";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const sq: SNode[] = [
  { x: 0, y: 0, smooth: false },
  { x: 1, y: 0, smooth: false },
  { x: 1, y: 1, smooth: true, hIn: { x: -0.1, y: 0 } },
];
const DEF = { frente: sq, costas: sq, mangaEsq: sq, mangaDir: sq };
const FONTS = ["Arial", "Impact"];
const layer = {
  id: "a",
  name: "Logo",
  kind: "imagem",
  src: PNG,
  cx: 0.5,
  cy: 0.3,
  w: 0.4,
  ratio: 1,
  rot: 0,
};
const vec = {
  id: "v",
  name: "Vetor",
  kind: "vetor",
  cx: 0.5,
  cy: 0.5,
  w: 0.2,
  ratio: 1,
  rot: 15,
  paths: [
    {
      subs: [{ nodes: sq, closed: true }],
      fill: "#ff0000",
      stroke: null,
      sw: 0.01,
      rule: "evenodd",
    },
  ],
};
const text = {
  id: "t",
  text: "OLÁ",
  x: 10,
  y: 20,
  fontFamily: "Impact",
  fontSize: 30,
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  color: "#112233",
  field: "nome",
  upper: true,
  fitWidth: 20,
  scaleWithSize: true,
  fieldAnchor: "esquerda",
};
const art = { src: PNG, cx: 0.5, cy: 0.4, w: 0.6, ratio: 1.2, rot: 10, flipX: true, opacity: 0.8 };
const data: ProjectData = {
  grading: { M: { bodyHeight: 70, bodyWidth: 50, sleeveHeight: 20, sleeveWidth: 18 } },
  mother: "M",
  clothingType: "Camiseta",
  shapes: DEF,
  artworks: { frente: art, costas: null, mangaEsq: null, mangaDir: null },
  styles: {
    frente: { stroke: "#000", fill: "rgb(10, 20, 30)" },
    costas: { stroke: null, fill: null },
    mangaEsq: { stroke: null, fill: null },
    mangaDir: { stroke: null, fill: null },
  },
  layers: { frente: [layer, vec], costas: [], mangaEsq: [], mangaDir: [] },
  texts: { frente: [text], costas: [], mangaEsq: [], mangaDir: [] },
  profiles: [],
  activeProfile: "",
};
const GD = { M: { bodyHeight: 1, bodyWidth: 1, sleeveHeight: 1, sleeveWidth: 1 } };

describe("sanitize — dados válidos", () => {
  it("projeto mínimo válido passa sem alterações", () => {
    expect(sanitizeLayers(data.layers)).toEqual({ value: data.layers, issues: [] });
    expect(sanitizeTexts(data.texts, FONTS)).toEqual({ value: data.texts, issues: [] });
    expect(sanitizeArtworks(data.artworks)).toEqual({ value: data.artworks, issues: [] });
    expect(sanitizeStyles(data.styles)).toEqual({ value: data.styles, issues: [] });
    expect(sanitizeShapes(data.shapes, DEF)).toEqual({ value: DEF, issues: [] });
    expect(sanitizeGrading(data.grading, GD)).toEqual({ value: data.grading, issues: [] });
  });
  it("ida e volta buildProjectFile → parseProjectFile → sanitizar mantém os dados", () => {
    const p = parseProjectFile(buildProjectFile("X", data));
    if (!p.ok) throw new Error("parse");
    expect(sanitizeLayers(p.data.layers).value).toEqual(data.layers);
    expect(sanitizeTexts(p.data.texts, FONTS).value).toEqual(data.texts);
    expect(sanitizeArtworks(p.data.artworks).value).toEqual(data.artworks);
  });
});

describe("sanitize — entradas hostis", () => {
  it("src com aspas, <script>, http e blob são descartados", () => {
    expect(safeImageSrc('data:image/png;base64,AA"onload=x')).toBeNull();
    expect(safeImageSrc("data:image/png;base64,<script>")).toBeNull();
    expect(safeImageSrc("http://x/a.png")).toBeNull();
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc("blob:abc")).toBeNull();
    const r = sanitizeLayers({ frente: [{ ...layer, src: "http://x" }] });
    expect(r.value.frente).toEqual([]);
    expect(r.issues).toContain("camadas sem imagem");
    expect(sanitizeArtworks({ frente: { ...art, src: "<script>" } }).value.frente).toBeNull();
  });
  it("rot como string, rule inválida e números NaN/Infinity/gigantes", () => {
    const r = sanitizeLayers({
      frente: [
        {
          ...vec,
          rot: "abc",
          cx: NaN,
          cy: Infinity,
          w: 1e30,
          paths: [{ ...vec.paths[0], rule: "x", sw: 1e9 }],
        },
      ],
    });
    const l = r.value.frente[0]!;
    expect(l.rot).toBe(0);
    expect(l.cx).toBe(0.5);
    expect(l.cy).toBe(0.5);
    expect(l.w).toBe(20);
    expect(l.paths![0]!.rule).toBe("nonzero");
    expect(l.paths![0]!.sw).toBe(5);
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it("nós que não são lista e 100 mil nós", () => {
    const r = sanitizeShapes(
      {
        frente: "x",
        costas: Array.from({ length: 100000 }, (_, i) => ({ x: i % 2, y: 0, smooth: false })),
      },
      DEF,
    );
    expect(r.value.frente).toBe(DEF.frente);
    expect(r.value.costas.length).toBe(5000);
    expect(r.value.mangaEsq).toBe(DEF.mangaEsq);
  });
  it("ids repetidos viram únicos", () => {
    const r = sanitizeLayers({ frente: [layer, layer], costas: [layer] });
    const ids = [...r.value.frente, ...r.value.costas].map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
    expect(r.issues).toContain("ids repetidos");
  });
  it("cores com ; ou url(...) são rejeitadas", () => {
    expect(cor("red;background:url(x)")).toBeNull();
    expect(cor("url(#g)")).toBeNull();
    expect(
      sanitizeTexts({ frente: [{ ...text, color: "#fff;x" }] }, FONTS).value.frente[0]!.color,
    ).toBe("#000000");
    expect(
      sanitizeStyles({ frente: { fill: "url(x)", stroke: null } }).value.frente.fill,
    ).toBeNull();
  });
  it("estruturas erradas: layers.frente null, texts.frente objeto", () => {
    expect(sanitizeLayers({ frente: null }).value.frente).toEqual([]);
    expect(sanitizeTexts({ frente: {} }, FONTS).value.frente).toEqual([]);
    expect(sanitizeLayers("lixo").value.costas).toEqual([]);
  });
  it("resumo agrupa os problemas", () => {
    expect(
      summarizeIssues(["camadas sem imagem", "coordenadas inválidas", "coordenadas inválidas"]),
    ).toBe(
      "3 itens inválidos foram descartados ou corrigidos: 1 camadas sem imagem, 2 coordenadas inválidas",
    );
  });
});
