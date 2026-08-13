import type { RenderManifest } from "@app/core";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { Captions } from "../components/Captions.tsx";
import { SceneMedia } from "../components/SceneMedia.tsx";
import { TitleCard } from "../components/TitleCard.tsx";
import { Transition } from "../components/Transition.tsx";

// A `type`, deliberately not an `interface`: Remotion's <Composition>
// constrains component props to Record<string, unknown>, and interfaces
// don't get TypeScript's implicit index signature, so an interface here
// fails to satisfy that constraint.
export type ShortsBasicProps = {
  manifest: RenderManifest;
};

/**
 * Full-bleed media with slow Ken Burns, an optional on-screen title, and
 * word-by-word captions over the top.
 *
 * Every timing decision was made upstream in compileManifest — this
 * component reads frame offsets, it never computes them. That's what keeps
 * the preview, the render and the transcribed captions on one timeline.
 */
export const ShortsBasic: React.FC<ShortsBasicProps> = ({ manifest }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {manifest.scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames}>
          <Transition durationInFrames={scene.durationInFrames}>
            <SceneMedia scene={scene} />
            {scene.overlayText && <TitleCard text={scene.overlayText} />}
          </Transition>
        </Sequence>
      ))}

      {/* Captions sit outside the scene sequences: their timings are in
          whole-timeline space, so they must not be re-based per scene. */}
      <Captions captions={manifest.captions} />

      {/* Exactly one audio track — the pre-mixed master. Remotion never sees
          the individual voiceover clips. */}
      {manifest.audioSrc && <Audio src={manifest.audioSrc} />}
    </AbsoluteFill>
  );
};
