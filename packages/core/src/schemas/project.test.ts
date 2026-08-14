import { describe, expect, test } from "bun:test";
import { describeFormat, resolveFormat } from "./project.ts";

describe("resolveFormat", () => {
  test("crosses aspect ratio with resolution correctly", () => {
    expect(resolveFormat("shorts", "1080p", 30)).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(resolveFormat("landscape", "1080p", 30)).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(resolveFormat("square", "1080p", 30)).toEqual({ width: 1080, height: 1080, fps: 30 });
  });

  test("720p halves the long edge relative to 1080p, per aspect", () => {
    expect(resolveFormat("shorts", "720p", 30)).toEqual({ width: 720, height: 1280, fps: 30 });
    expect(resolveFormat("landscape", "720p", 30)).toEqual({ width: 1280, height: 720, fps: 30 });
  });

  test("fps passes through untouched", () => {
    expect(resolveFormat("shorts", "1080p", 60).fps).toBe(60);
    expect(resolveFormat("shorts", "1080p", 120).fps).toBe(120);
  });
});

describe("describeFormat", () => {
  test("is the exact inverse of resolveFormat for every combo", () => {
    const aspects = ["shorts", "landscape", "square"] as const;
    const resolutions = ["720p", "1080p"] as const;
    const fpsOptions = [30, 60, 120] as const;

    for (const aspect of aspects) {
      for (const resolution of resolutions) {
        for (const fps of fpsOptions) {
          const format = resolveFormat(aspect, resolution, fps);
          expect(describeFormat(format)).toEqual({ aspect, resolution, fps });
        }
      }
    }
  });

  test("returns null for dimensions that match no combo (hand-edited project.json)", () => {
    expect(describeFormat({ width: 640, height: 480, fps: 30 })).toBeNull();
  });

  test("returns null for an fps outside the allowed set even if dimensions match", () => {
    expect(describeFormat({ width: 1080, height: 1920, fps: 24 })).toBeNull();
  });
});
