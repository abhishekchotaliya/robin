import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../schemas/settings.ts";
import type { Settings } from "../schemas/settings.ts";
import { createEmptyProject, deriveStatus, sceneAudioHash } from "./defaults.ts";

const settings: Settings = { projectsRoot: "/tmp/videostudio", ...DEFAULT_SETTINGS };

function makeProject() {
  return createEmptyProject({
    title: "Test Project",
    slug: "test-project",
    formatPreset: "shorts",
    templateId: "shorts-basic",
    defaults: settings,
  });
}

describe("createEmptyProject", () => {
  test("starts with one empty color scene and draft status", () => {
    const project = makeProject();
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0]?.media.kind).toBe("color");
    expect(project.status).toBe("draft");
  });
});

describe("deriveStatus", () => {
  test("no scenes -> draft", () => {
    const project = makeProject();
    project.scenes = [];
    expect(deriveStatus(project)).toBe("draft");
  });

  test("empty narration -> draft", () => {
    const project = makeProject();
    expect(deriveStatus(project)).toBe("draft");
  });

  test("narration present, no audio -> scripted", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    expect(deriveStatus(project)).toBe("scripted");
  });

  test("fresh audio on an image scene with no asset -> voiced", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.media = { ...project.scenes[0]!.media, kind: "image", assetId: null };
    project.scenes[0]!.audio = {
      file: "audio/vo/abc.mp3",
      durationMs: 2000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    expect(deriveStatus(project)).toBe("voiced");
  });

  test("stale audio hash (text changed after synthesis) -> scripted, not voiced", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.audio = {
      file: "audio/vo/abc.mp3",
      durationMs: 2000,
      hash: sceneAudioHash("a different sentence", project.voice),
    };
    expect(deriveStatus(project)).toBe("scripted");
  });

  test("asset assigned to every non-color scene -> ready", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.media = { ...project.scenes[0]!.media, kind: "image", assetId: "asset-1" };
    project.scenes[0]!.audio = {
      file: "audio/vo/abc.mp3",
      durationMs: 2000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    expect(deriveStatus(project)).toBe("ready");
  });

  test("color scenes never block on missing assets -> ready as soon as voiced", () => {
    const project = makeProject(); // default scene is kind: "color"
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.audio = {
      file: "audio/vo/abc.mp3",
      durationMs: 2000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    expect(deriveStatus(project)).toBe("ready");
  });

  test("matching manifest hash -> rendered", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.audio = {
      file: "audio/vo/abc.mp3",
      durationMs: 2000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    project.lastRender = {
      path: "renders/out.mp4",
      renderedAt: new Date().toISOString(),
      durationMs: 2000,
      manifestHash: "deadbeef",
    };
    expect(deriveStatus(project, "deadbeef")).toBe("rendered");
    expect(deriveStatus(project, "somethingelse")).toBe("ready");
  });
});
