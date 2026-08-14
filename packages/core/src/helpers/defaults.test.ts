import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../schemas/settings.ts";
import type { Settings } from "../schemas/settings.ts";
import {
  createEmptyProject,
  deriveStatus,
  isSceneAudioStale,
  sceneAudioHash,
  scenesNeedingAudio,
} from "./defaults.ts";

const settings: Settings = { projectsRoot: "/tmp/videostudio", ...DEFAULT_SETTINGS };

function makeProject() {
  return createEmptyProject({
    title: "Test Project",
    slug: "test-project",
    formatPreset: "shorts",
    resolution: "1080p",
    fps: 30,
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

describe("isSceneAudioStale / scenesNeedingAudio", () => {
  test("a scene with no audio is stale", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    expect(isSceneAudioStale(project.scenes[0]!, project.voice)).toBe(true);
  });

  test("an empty scene is never stale — there's nothing to say", () => {
    const project = makeProject();
    expect(isSceneAudioStale(project.scenes[0]!, project.voice)).toBe(false);
    expect(scenesNeedingAudio(project)).toHaveLength(0);
  });

  test("audio matching the current text and voice is fresh", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.audio = {
      file: "audio/vo/x.mp3",
      durationMs: 1000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    expect(isSceneAudioStale(project.scenes[0]!, project.voice)).toBe(false);
  });

  test("changing the voice makes existing audio stale", () => {
    const project = makeProject();
    project.scenes[0]!.text = "hello world";
    project.scenes[0]!.audio = {
      file: "audio/vo/x.mp3",
      durationMs: 1000,
      hash: sceneAudioHash("hello world", project.voice),
    };
    project.voice = { ...project.voice, voiceId: "a-different-voice" };
    expect(isSceneAudioStale(project.scenes[0]!, project.voice)).toBe(true);
  });

  test("only stale scenes are returned for synthesis", () => {
    const project = makeProject();
    project.scenes = [
      { ...project.scenes[0]!, id: "a", text: "fresh one" },
      { ...project.scenes[0]!, id: "b", text: "needs audio" },
      { ...project.scenes[0]!, id: "c", text: "" },
    ];
    project.scenes[0]!.audio = {
      file: "audio/vo/a.mp3",
      durationMs: 900,
      hash: sceneAudioHash("fresh one", project.voice),
    };
    expect(scenesNeedingAudio(project).map((s) => s.id)).toEqual(["b"]);
  });
});
