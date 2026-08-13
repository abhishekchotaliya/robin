import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type Settings } from "../schemas/settings.ts";
import { createEmptyProject, createEmptyScene } from "./defaults.ts";
import { compileManifest } from "./manifest-compile.ts";
import { SCENE_GAP_MS, captionsHash, computeSceneTimeline, mixHash } from "./timeline.ts";

const settings: Settings = { projectsRoot: "/tmp/videostudio", ...DEFAULT_SETTINGS };

function projectWithScenes(durations: number[]) {
  const project = createEmptyProject({
    title: "Timeline",
    slug: "timeline",
    formatPreset: "shorts",
    templateId: "shorts-basic",
    defaults: settings,
  });
  project.scenes = durations.map((durationMs, i) => ({
    ...createEmptyScene(i, `scene ${i}`),
    audio: { file: `audio/vo/${i}.mp3`, durationMs, hash: `hash-${i}` },
  }));
  return project;
}

describe("computeSceneTimeline", () => {
  test("first scene starts at zero", () => {
    const { entries } = computeSceneTimeline(projectWithScenes([1000, 2000]));
    expect(entries[0]?.startMs).toBe(0);
  });

  test("each scene starts after the previous one plus the gap", () => {
    const { entries } = computeSceneTimeline(projectWithScenes([1000, 2000, 500]));
    expect(entries.map((e) => e.startMs)).toEqual([0, 1000 + SCENE_GAP_MS, 1000 + 2000 + SCENE_GAP_MS * 2]);
  });

  test("total duration excludes a trailing gap", () => {
    const { totalDurationMs } = computeSceneTimeline(projectWithScenes([1000, 2000]));
    expect(totalDurationMs).toBe(1000 + SCENE_GAP_MS + 2000);
  });

  test("an empty project has no duration", () => {
    const project = projectWithScenes([]);
    expect(computeSceneTimeline(project)).toEqual({ entries: [], totalDurationMs: 0 });
  });

  test("scenes are ordered by `order`, not array position", () => {
    const project = projectWithScenes([1000, 2000]);
    project.scenes = [
      { ...project.scenes[0]!, order: 1 },
      { ...project.scenes[1]!, order: 0 },
    ];
    const { entries } = computeSceneTimeline(project);
    expect(entries[0]?.sceneId).toBe(project.scenes[1]!.id);
  });
});

describe("compileManifest agrees with computeSceneTimeline", () => {
  // Captions are transcribed from audio built on computeSceneTimeline, while
  // Remotion renders compileManifest's frames. If these two ever disagree,
  // captions drift out of sync with the picture.
  test("scene start frames match the shared timeline", () => {
    const project = projectWithScenes([1000, 2000, 1500]);
    const timeline = computeSceneTimeline(project);
    const manifest = compileManifest(project, {
      pathMode: "fs",
      projectDir: "/tmp/p",
      assets: [],
      words: null,
      masterAudioExists: false,
    });

    const fps = project.format.fps;
    for (const [i, entry] of timeline.entries.entries()) {
      expect(manifest.scenes[i]?.from).toBe(Math.round((entry.startMs / 1000) * fps));
    }
    expect(manifest.durationInFrames).toBe(Math.round((timeline.totalDurationMs / 1000) * fps));
  });
});

describe("captionsHash", () => {
  test("is stable for unchanged audio", () => {
    const project = projectWithScenes([1000, 2000]);
    expect(captionsHash(project)).toBe(captionsHash(projectWithScenes([1000, 2000])));
  });

  test("changes when a scene's audio changes", () => {
    const before = projectWithScenes([1000, 2000]);
    const after = projectWithScenes([1000, 2000]);
    after.scenes[1]!.audio = { ...after.scenes[1]!.audio!, hash: "different" };
    expect(captionsHash(before)).not.toBe(captionsHash(after));
  });

  test("changes when scenes are reordered", () => {
    const before = projectWithScenes([1000, 2000]);
    const after = projectWithScenes([1000, 2000]);
    after.scenes = [
      { ...after.scenes[0]!, order: 1 },
      { ...after.scenes[1]!, order: 0 },
    ];
    expect(captionsHash(before)).not.toBe(captionsHash(after));
  });
});

describe("mixHash", () => {
  test("is stable when nothing relevant changed", () => {
    expect(mixHash(projectWithScenes([1000, 2000]))).toBe(mixHash(projectWithScenes([1000, 2000])));
  });

  test.each([
    ["gain", { gainDb: -6 }],
    ["ducking", { duckingDb: -20 }],
    ["fade in", { fadeInMs: 1200 }],
    ["fade out", { fadeOutMs: 1200 }],
    ["bgm track", { assetId: "some-asset" }],
  ])("changes when %s changes", (_label, patch) => {
    const before = projectWithScenes([1000, 2000]);
    const after = projectWithScenes([1000, 2000]);
    after.bgm = { ...after.bgm, ...patch };
    expect(mixHash(before)).not.toBe(mixHash(after));
  });

  test("changes when the voiceover changes", () => {
    const before = projectWithScenes([1000, 2000]);
    const after = projectWithScenes([1000, 2000]);
    after.scenes[0]!.audio = { ...after.scenes[0]!.audio!, hash: "regenerated" };
    expect(mixHash(before)).not.toBe(mixHash(after));
  });

  test("ignores changes that don't affect audio", () => {
    const before = projectWithScenes([1000, 2000]);
    const after = projectWithScenes([1000, 2000]);
    after.scenes[0]!.media = { ...after.scenes[0]!.media, color: "#ff0000" };
    after.title = "Renamed";
    expect(mixHash(before)).toBe(mixHash(after));
  });
});
