// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { artImageMarkup, layerMarkup, type Layer } from "./importers";
import { artTransform } from "@/components/PowerClipEditor";
import { attr, color, n, safeSrc } from "./svg-safe";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const wrap = (s: string) => `<svg xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
const ALLOWED: Record<string, string[]> = {
  svg: ["xmlns"],
  g: ["transform"],
  image: ["href", "x", "y", "width", "height", "transform", "opacity", "preserveAspectRatio"],
  path: ["d", "fill", "stroke", "stroke-width", "fill-rule"],
};
function checkDom(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const allowed = ALLOWED[el.tagName];
    expect(allowed, `elemento inesperado ${el.tagName}`).toBeDefined();
    for (const a of Array.from(el.attributes)) {
      expect(allowed).toContain(a.name);
      expect(a.name.startsWith("on")).toBe(false);
    }
    const href = el.getAttribute("href");
    if (href) expect(href.startsWith("data:image/")).toBe(true);
  }
  expect(doc.getElementsByTagName("script").length).toBe(0);
}

const hostile = (over: Record<string, unknown>) => ({ id: "x", name: "x", kind: "imagem", cx: 0.5, cy: 0.5, w: 0.3, ratio: 1, rot: 0, ...over }) as unknown as Layer;

describe("svg-safe", () => {
  it("helpers", () => {
    expect(n(1.5)).toBe("1.5");
    expect(n("0)\" onload=\"x")).toBe("0");
    expect(n(NaN)).toBe("0");
    expect(attr(`"<&'>`)).toBe("&quot;&lt;&amp;&#39;&gt;");
    expect(safeSrc("http://x")).toBe("");
    expect(color("red;x")).toBe("none");
  });

  it("camada e estampa hostis não injetam elementos nem atributos", () => {
    const svg = wrap(
      layerMarkup(hostile({ src: `data:image/png;base64,AA" onload="alert(1)`, rot: `0)" onload="x` }), 30, 40) +
        layerMarkup(hostile({ src: "<script>alert(1)</script>" }), 30, 40) +
        layerMarkup(
          hostile({
            kind: "vetor",
            src: undefined,
            rot: "abc",
            paths: [{ subs: [{ nodes: [{ x: 0, y: 0, smooth: false }, { x: 1, y: 1, smooth: false }], closed: true }], fill: 'red" onclick="x', stroke: "url(javascript:x)", sw: "1", rule: 'evenodd" onload="x' }],
          }),
          30,
          40,
        ) +
        artImageMarkup({ src: `${PNG}"/><script>x</script>`, cx: "a" as unknown as number, cy: 0.5, w: 0.5, ratio: 1, opacity: "1\" onload=\"x" as unknown as number }, 30, 40, (cx, cy) => artTransform({ rot: `0)" onload="x` as unknown as number }, cx, cy)),
    );
    checkDom(svg);
    expect(svg).not.toMatch(/onload|onclick|<script/);
  });

  it("entradas válidas geram o mesmo SVG de antes", () => {
    const l = hostile({ src: PNG, cx: 0.5, cy: 0.25, w: 0.5, ratio: 2, rot: 10 });
    expect(layerMarkup(l, 40, 60)).toBe(
      `<g transform="translate(0 15) rotate(10)"><image href="${PNG}" x="-10" y="-20" width="20" height="40" preserveAspectRatio="none"/></g>`,
    );
    const v = hostile({ kind: "vetor", src: undefined, w: 1, ratio: 1, cx: 0.5, cy: 0, rot: 0, paths: [{ subs: [{ nodes: [{ x: 0, y: 0, smooth: false }, { x: 1, y: 0, smooth: false }, { x: 1, y: 1, smooth: false }], closed: true }], fill: "#ff0000", stroke: null, sw: 0.1, rule: "evenodd" }] });
    expect(layerMarkup(v, 10, 10)).toBe(
      `<g transform="translate(0 0) rotate(0)"><g transform="translate(0 -5)"><path d="M -5 0 L 5 0 L 5 10 L -5 0 Z" fill="#ff0000" stroke="none" stroke-width="1" fill-rule="evenodd"/></g></g>`,
    );
    expect(artImageMarkup({ src: PNG, cx: 0.5, cy: 0.5, w: 0.5, ratio: 1, opacity: 0.8 }, 20, 20, (cx, cy) => artTransform({ rot: 5 }, cx, cy))).toBe(
      `<image href="${PNG}" x="-5" y="5" width="10" height="10" transform="rotate(5 0 10)" opacity="0.8" preserveAspectRatio="none"/>`,
    );
  });
});
