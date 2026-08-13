import type { ManifestWord } from "../schemas/manifest.ts";

// A word must occupy a real span of time or the caption component can never
// highlight it: whisper emits start === end for very short tokens.
const MIN_WORD_MS = 80;

const PUNCTUATION_ONLY = /^[.,!?;:—–\-"'’”)\]}…]+$/;

/**
 * Turns raw whisper tokens into words fit for display.
 *
 * Whisper emits punctuation as its own token and gives short tokens
 * zero-length spans. Both are fine for a transcript and wrong for captions,
 * so punctuation is merged onto the preceding word and every word is given a
 * span that actually contains time.
 */
export function normalizeWords(words: ManifestWord[]): ManifestWord[] {
  const merged: ManifestWord[] = [];

  for (const word of words) {
    const text = word.text.trim();
    if (text.length === 0) continue;

    const previous = merged[merged.length - 1];
    if (PUNCTUATION_ONLY.test(text) && previous) {
      // Attach to the previous word rather than showing "." on its own.
      previous.text += text;
      previous.endMs = Math.max(previous.endMs, word.endMs);
      continue;
    }

    merged.push({ text, startMs: word.startMs, endMs: word.endMs });
  }

  // Give every word a real duration, without letting one overrun the next.
  return merged.map((word, index) => {
    const next = merged[index + 1];
    const desiredEnd = Math.max(word.endMs, word.startMs + MIN_WORD_MS);
    const cappedEnd = next ? Math.min(desiredEnd, Math.max(next.startMs, word.startMs + 1)) : desiredEnd;
    return { ...word, endMs: cappedEnd };
  });
}
