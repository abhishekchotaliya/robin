import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type Settings } from "../schemas/settings.ts";
import { createEmptyProject, createEmptyScene } from "./defaults.ts";
import { groupWordsIntoLines } from "./manifest-compile.ts";
import { computeSceneTimeline } from "./timeline.ts";

const settings: Settings = { projectsRoot: "/tmp/videostudio", ...DEFAULT_SETTINGS };

// Two scenes: 0–2000ms, then (2000+300 gap) 2300–4300ms.
function twoSceneTimeline() {
  const project = createEmptyProject({
    title: "Captions",
    slug: "captions",
    formatPreset: "shorts",
    templateId: "shorts-basic",
    defaults: settings,
  });
  project.scenes = [0, 1].map((i) => ({
    ...createEmptyScene(i, `scene ${i}`),
    audio: { file: `audio/vo/${i}.mp3`, durationMs: 2000, hash: `h${i}` },
  }));
  return computeSceneTimeline(project);
}

describe("groupWordsIntoLines", () => {
  const timeline = twoSceneTimeline();

  test("chunks words up to the requested line length", () => {
    const words = ["one", "two", "three", "four", "five"].map((text, i) => ({
      text,
      startMs: i * 100,
      endMs: i * 100 + 90,
    }));
    const lines = groupWordsIntoLines(words, 2, timeline);
    expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([
      ["one", "two"],
      ["three", "four"],
      ["five"],
    ]);
  });

  test("a line never straddles a scene cut", () => {
    // "last" ends scene 1; "first" opens scene 2. With a naive global chunk
    // of 4 these would share a line, leaving scene 1's word on screen over
    // scene 2's picture.
    const words = [
      { text: "scene", startMs: 100, endMs: 400 },
      { text: "one", startMs: 500, endMs: 800 },
      { text: "last", startMs: 1500, endMs: 1900 },
      { text: "first", startMs: 2400, endMs: 2700 },
      { text: "of", startMs: 2800, endMs: 3000 },
      { text: "two", startMs: 3100, endMs: 3400 },
    ];
    const lines = groupWordsIntoLines(words, 4, timeline);
    expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([
      ["scene", "one", "last"],
      ["first", "of", "two"],
    ]);
  });

  test("words trailing into the gap stay with the scene they came from", () => {
    const words = [
      { text: "trailing", startMs: 1900, endMs: 2050 }, // starts inside scene 1
      { text: "gap", startMs: 2100, endMs: 2250 }, // inside the 300ms silence
      { text: "next", startMs: 2400, endMs: 2600 }, // scene 2
    ];
    const lines = groupWordsIntoLines(words, 4, timeline);
    expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([["trailing", "gap"], ["next"]]);
  });

  test("line start and end span its own words", () => {
    const words = [
      { text: "a", startMs: 100, endMs: 200 },
      { text: "b", startMs: 300, endMs: 650 },
    ];
    const [line] = groupWordsIntoLines(words, 4, timeline);
    expect(line?.startMs).toBe(100);
    expect(line?.endMs).toBe(650);
  });

  test("no words means no lines", () => {
    expect(groupWordsIntoLines([], 4, timeline)).toEqual([]);
  });
});
