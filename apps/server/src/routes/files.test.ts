import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PROJECTS_DIR } from "../config.ts";
import { resolveWithinProjects } from "./files.ts";

const ROOT = resolve(PROJECTS_DIR);

describe("resolveWithinProjects", () => {
  test("resolves ordinary project media paths", () => {
    expect(resolveWithinProjects("my-project/assets/photo.jpg")).toBe(
      `${ROOT}/my-project/assets/photo.jpg`,
    );
  });

  test("decodes percent-encoded spaces in real filenames", () => {
    expect(resolveWithinProjects("my-project/assets/a%20photo.jpg")).toBe(
      `${ROOT}/my-project/assets/a photo.jpg`,
    );
  });

  // The security property: for ANY input, the result is either rejected
  // (null) or a path strictly inside the projects root. It must never be a
  // path elsewhere on the filesystem.
  test.each([
    ["plain traversal", "../../../etc/passwd"],
    ["traversal below a valid prefix", "my-project/../../../../etc/passwd"],
    ["deep traversal from a real asset path", "my-project/assets/../../../../../../etc/passwd"],
    ["url-encoded traversal", "%2e%2e%2f%2e%2e%2fetc%2fpasswd"],
    ["double-encoded traversal", "%252e%252e%252fetc"],
    ["absolute path escape", "/etc/passwd"],
    ["backslash traversal", "..\\..\\etc\\passwd"],
    ["dot-padded traversal", "....//....//etc/passwd"],
    ["traversal to the parent of the root", "../settings.json"],
  ])("contains %s", (_label, attack) => {
    const result = resolveWithinProjects(attack);
    if (result === null) return; // rejected outright, which is fine
    expect(result.startsWith(`${ROOT}/`)).toBe(true);
    expect(result).not.toBe("/etc/passwd");
    expect(result.includes("/../")).toBe(false);
  });

  test("rejects a NUL byte outright", () => {
    expect(resolveWithinProjects("my-project/photo.jpg\0.txt")).toBeNull();
  });

  test("rejects malformed percent-encoding", () => {
    expect(resolveWithinProjects("%E0%A4%A")).toBeNull();
  });

  test("rejects a sibling directory sharing the root's name prefix", () => {
    expect(resolveWithinProjects("../projects-evil/secret.txt")).not.toBe(`${ROOT}-evil/secret.txt`);
  });
});
