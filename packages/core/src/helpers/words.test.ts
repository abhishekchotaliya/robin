import { describe, expect, test } from "bun:test";
import { normalizeWords } from "./words.ts";

describe("normalizeWords", () => {
  test("merges standalone punctuation onto the previous word", () => {
    const result = normalizeWords([
      { text: "line", startMs: 1480, endMs: 1610 },
      { text: ".", startMs: 2020, endMs: 2020 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("line.");
    expect(result[0]?.endMs).toBe(2020);
  });

  test("gives zero-length words a span that can actually be highlighted", () => {
    const result = normalizeWords([{ text: "A", startMs: 60, endMs: 60 }]);
    expect(result[0]?.endMs).toBeGreaterThan(result[0]!.startMs);
  });

  test("a word never overruns the next one", () => {
    const result = normalizeWords([
      { text: "one", startMs: 0, endMs: 0 },
      { text: "two", startMs: 40, endMs: 200 },
    ]);
    expect(result[0]?.endMs).toBeLessThanOrEqual(result[1]!.startMs);
  });

  test("leading punctuation with no previous word is kept, not dropped", () => {
    const result = normalizeWords([{ text: "…", startMs: 0, endMs: 10 }]);
    expect(result).toHaveLength(1);
  });

  test("blank tokens are discarded", () => {
    const result = normalizeWords([
      { text: "   ", startMs: 0, endMs: 10 },
      { text: "word", startMs: 20, endMs: 200 },
    ]);
    expect(result.map((w) => w.text)).toEqual(["word"]);
  });

  test("ordinary speech passes through with text intact", () => {
    const result = normalizeWords([
      { text: "Second", startMs: 2260, endMs: 2370 },
      { text: "scene", startMs: 2600, endMs: 2760 },
    ]);
    expect(result.map((w) => w.text)).toEqual(["Second", "scene"]);
  });
});
