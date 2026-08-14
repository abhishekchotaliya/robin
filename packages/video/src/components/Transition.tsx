import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/**
 * Fades a scene in at its start and out at its end.
 *
 * Scenes are separated by a short silence in the audio, so hard cuts read as
 * jumpy; a few frames of fade at each edge covers the seam. Kept as its own
 * component so richer transitions (slide, wipe) can slot in without touching
 * the template.
 */
export const Transition: React.FC<{
  durationInFrames: number;
  fadeFrames?: number;
  children: ReactNode;
}> = ({ durationInFrames, fadeFrames = 6, children }) => {
  const frame = useCurrentFrame();

  // Never spend more than a third of a short scene fading.
  const fade = Math.min(fadeFrames, Math.floor(durationInFrames / 3));

  const opacity =
    fade <= 0
      ? 1
      : interpolate(
          frame,
          [0, fade, Math.max(fade, durationInFrames - fade), durationInFrames],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
