import { describe, expect, it } from "vitest";
import { offsetPathD } from "./vector-offset";

const square = "M 0 0 L 10 0 L 10 10 L 0 10 Z";
function area(d: string) {
  const v = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  let a = 0;
  const n = v.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += v[2 * i]! * v[2 * j + 1]! - v[2 * j]! * v[2 * i + 1]!;
  }
  return Math.abs(a / 2);
}

describe("vector-offset", () => {
  it("quadrado 10×10 deslocado +1 cm: ~12×12 com cantos arredondados", () => {
    const a = area(offsetPathD(square, 1));
    expect(a).toBeGreaterThan(100 + 40 + Math.PI - 1.5); // 10² + 4·10·1 + π·1²
    expect(a).toBeLessThan(144 + 0.5); // nunca maior que o quadrado 12×12
  });
  it("quadrado 10×10 deslocado -1 cm: ~8×8", () => {
    expect(area(offsetPathD(square, -1))).toBeCloseTo(64, 0);
  });
  it("segurança maior que a peça devolve vazio", () => {
    expect(offsetPathD(square, -6)).toBe("");
  });
  it("distância 0 devolve o traçado original", () => {
    expect(offsetPathD(square, 0)).toBe(square);
  });
});
