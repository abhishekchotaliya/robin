import type { Scene } from "../schemas/project.ts";

// Splits a pasted script into per-scene narration blocks on blank lines.
// Blank-line separation is the rule because it's what people already do when
// writing a script, and it stays predictable — no sentence-boundary guessing.
export function splitTextIntoScenes(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim().replace(/\s+/g, " "))
    .filter((block) => block.length > 0);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

// Scene.order is the source of truth for sequence; array position follows it.
// Call after any reorder/insert/delete so the two can never disagree.
export function reindexScenes(scenes: Scene[]): Scene[] {
  return scenes.map((scene, index) => (scene.order === index ? scene : { ...scene, order: index }));
}

// The drag-and-drop reorder, kept out of the component so it's testable
// without a DOM: takes the dragged scene's id and the one it was dropped on.
export function moveScene(scenes: Scene[], activeId: string, overId: string): Scene[] {
  if (activeId === overId) return scenes;
  const from = scenes.findIndex((s) => s.id === activeId);
  const to = scenes.findIndex((s) => s.id === overId);
  if (from === -1 || to === -1) return scenes;

  const next = [...scenes];
  const [moved] = next.splice(from, 1);
  if (!moved) return scenes;
  next.splice(to, 0, moved);
  return reindexScenes(next);
}
