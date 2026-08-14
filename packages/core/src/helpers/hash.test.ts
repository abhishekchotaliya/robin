import { describe, expect, test } from "bun:test";
import { hashContent } from "./hash.ts";

describe("hashContent", () => {
  test("is deterministic", () => {
    expect(hashContent("a", "b")).toBe(hashContent("a", "b"));
  });

  test("distinguishes different inputs", () => {
    expect(hashContent("a", "b")).not.toBe(hashContent("a", "c"));
  });

  test("distinguishes part boundaries (not just concatenation)", () => {
    expect(hashContent("ab", "c")).not.toBe(hashContent("a", "bc"));
  });

  test("returns a fixed-length hex string", () => {
    const h = hashContent("anything");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
