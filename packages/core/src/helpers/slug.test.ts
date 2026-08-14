import { describe, expect, test } from "bun:test";
import { slugify } from "./slug.ts";

describe("slugify", () => {
  test("lowercases and dashes spaces", () => {
    expect(slugify("Tech News #1")).toBe("tech-news-1");
  });

  test("strips leading/trailing separators", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });

  test("falls back to 'untitled' when nothing alphanumeric survives", () => {
    expect(slugify("???")).toBe("untitled");
  });

  test("collapses repeated separators", () => {
    expect(slugify("a---b   c")).toBe("a-b-c");
  });
});
