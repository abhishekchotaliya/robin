import { describe, expect, test } from "bun:test";
import { assetKindFromMime, formatBytes, isAcceptedMime, sanitizeFilename } from "./asset.ts";

describe("assetKindFromMime", () => {
  test("maps known types to their kind", () => {
    expect(assetKindFromMime("image/png")).toBe("image");
    expect(assetKindFromMime("video/mp4")).toBe("video");
    expect(assetKindFromMime("audio/mpeg")).toBe("audio");
  });

  test("tolerates charset parameters and casing", () => {
    expect(assetKindFromMime("IMAGE/PNG")).toBe("image");
    expect(assetKindFromMime("audio/wav; charset=binary")).toBe("audio");
  });

  test("rejects anything not on the allowlist", () => {
    expect(assetKindFromMime("application/pdf")).toBeNull();
    expect(assetKindFromMime("text/html")).toBeNull();
    expect(assetKindFromMime("")).toBeNull();
    expect(isAcceptedMime("application/x-sh")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  test("strips directory components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Windows\\evil.png")).toBe("evil.png");
  });

  test("removes leading dots so it can't become a hidden or relative name", () => {
    expect(sanitizeFilename("...hidden.png")).toBe("hidden.png");
    expect(sanitizeFilename("..")).toBe("file");
  });

  test("replaces characters that would need shell quoting", () => {
    expect(sanitizeFilename("my photo (1);rm -rf.png")).toBe("my-photo--1--rm--rf.png");
  });

  test("keeps ordinary names intact", () => {
    expect(sanitizeFilename("beach_sunset-02.jpg")).toBe("beach_sunset-02.jpg");
  });

  test("never returns an empty string", () => {
    expect(sanitizeFilename("///")).toBe("file");
  });
});

describe("formatBytes", () => {
  test("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
