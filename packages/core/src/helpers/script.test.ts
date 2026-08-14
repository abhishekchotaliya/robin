import { describe, expect, test } from "bun:test";
import { createEmptyScene } from "./defaults.ts";
import { countWords, moveScene, reindexScenes, splitTextIntoScenes } from "./script.ts";

describe("splitTextIntoScenes", () => {
  test("splits on blank lines", () => {
    expect(splitTextIntoScenes("First scene.\n\nSecond scene.")).toEqual(["First scene.", "Second scene."]);
  });

  test("tolerates whitespace-only separator lines and extra blank lines", () => {
    expect(splitTextIntoScenes("One.\n   \n\n\nTwo.")).toEqual(["One.", "Two."]);
  });

  test("collapses newlines inside a block into single spaces", () => {
    expect(splitTextIntoScenes("A line\nand its continuation.")).toEqual(["A line and its continuation."]);
  });

  test("empty input yields no scenes", () => {
    expect(splitTextIntoScenes("   \n\n  ")).toEqual([]);
  });
});

describe("countWords", () => {
  test("counts words, ignoring surrounding whitespace", () => {
    expect(countWords("  three little words  ")).toBe(3);
  });

  test("empty string is zero, not one", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("reindexScenes", () => {
  test("renumbers order to match array position", () => {
    const scenes = [createEmptyScene(5), createEmptyScene(2), createEmptyScene(9)];
    expect(reindexScenes(scenes).map((s) => s.order)).toEqual([0, 1, 2]);
  });

  test("returns the same object identity for already-correct scenes", () => {
    const scenes = [createEmptyScene(0), createEmptyScene(1)];
    const result = reindexScenes(scenes);
    expect(result[0]).toBe(scenes[0]);
    expect(result[1]).toBe(scenes[1]);
  });
});

describe("moveScene", () => {
  const scenes = [
    createEmptyScene(0, "first"),
    createEmptyScene(1, "second"),
    createEmptyScene(2, "third"),
  ];
  const [first, second, third] = scenes as [
    (typeof scenes)[number],
    (typeof scenes)[number],
    (typeof scenes)[number],
  ];

  test("moves a later scene up and renumbers order", () => {
    const result = moveScene(scenes, third.id, first.id);
    expect(result.map((s) => s.text)).toEqual(["third", "first", "second"]);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  test("moves an earlier scene down", () => {
    const result = moveScene(scenes, first.id, third.id);
    expect(result.map((s) => s.text)).toEqual(["second", "third", "first"]);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  test("dropping onto itself is a no-op", () => {
    expect(moveScene(scenes, second.id, second.id)).toBe(scenes);
  });

  test("unknown ids leave the list untouched", () => {
    expect(moveScene(scenes, "nope", first.id)).toBe(scenes);
    expect(moveScene(scenes, first.id, "nope")).toBe(scenes);
  });
});
