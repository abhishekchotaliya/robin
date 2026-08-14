import { describe, expect, test } from "bun:test";
import { estimateSceneDurationMs } from "./duration.ts";

describe("estimateSceneDurationMs", () => {
  test("empty text hits the floor", () => {
    expect(estimateSceneDurationMs("")).toBe(1500);
  });

  test("scales with word count at 150 wpm", () => {
    const words = Array(150).fill("word").join(" "); // 150 words = 60s at 150wpm
    expect(estimateSceneDurationMs(words)).toBe(60_000);
  });

  test("short text still hits the floor", () => {
    expect(estimateSceneDurationMs("one two")).toBe(1500);
  });

  test("respects a custom wpm", () => {
    const words = Array(300).fill("word").join(" ");
    expect(estimateSceneDurationMs(words, 300)).toBe(60_000);
  });
});
