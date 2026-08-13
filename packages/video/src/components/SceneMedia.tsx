import type { ManifestScene } from "@app/core";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame } from "remotion";

/**
 * One scene's background: an image, a video, or a flat colour.
 *
 * Ken Burns is a slow scale ramp across the scene's own duration — the drift
 * is what stops a still image from looking like a frozen slide.
 */
export const SceneMedia: React.FC<{ scene: ManifestScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { media } = scene;

  const scale = media.kenBurns.enabled
    ? interpolate(
        frame,
        [0, Math.max(1, scene.durationInFrames)],
        [media.kenBurns.zoomFrom, media.kenBurns.zoomTo],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 1;

  // The colour always sits underneath: it shows through for `kind: "color"`,
  // and covers the letterboxing when a "contain" image doesn't fill the frame.
  return (
    <AbsoluteFill style={{ backgroundColor: media.color }}>
      {media.src && (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          {media.kind === "video" ? (
            <OffthreadVideo
              src={media.src}
              muted
              style={{ width: "100%", height: "100%", objectFit: media.fit }}
            />
          ) : (
            <Img src={media.src} style={{ width: "100%", height: "100%", objectFit: media.fit }} />
          )}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
