import { RenderManifestSchema, type RenderManifest } from "@app/core";
import { Composition } from "remotion";
import { ShortsBasic, type ShortsBasicProps } from "./templates/ShortsBasic.tsx";

// Shown when the composition is opened without real inputProps (Remotion
// Studio). The renderer always passes a compiled manifest.
const PLACEHOLDER_MANIFEST: RenderManifest = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 90,
  scenes: [
    {
      id: "placeholder",
      from: 0,
      durationInFrames: 90,
      media: {
        kind: "color",
        src: null,
        fit: "cover",
        color: "#18181b",
        kenBurns: { enabled: false, direction: "in", zoomFrom: 1, zoomTo: 1.08 },
      },
      overlayText: "Open a project to preview it",
    },
  ],
  audioSrc: null,
  captions: { enabled: false, style: "bold-center", lines: [] },
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortsBasic"
      component={ShortsBasic}
      // These are placeholders: calculateMetadata replaces all four from the
      // manifest, so format and length are never hardcoded here.
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={90}
      defaultProps={{ manifest: PLACEHOLDER_MANIFEST } satisfies ShortsBasicProps}
      calculateMetadata={({ props }) => {
        // Validating here means a drifting manifest fails loudly at the
        // boundary rather than rendering something subtly wrong for minutes.
        const manifest = RenderManifestSchema.parse(props.manifest);
        return {
          width: manifest.width,
          height: manifest.height,
          fps: manifest.fps,
          durationInFrames: Math.max(1, manifest.durationInFrames),
          props: { manifest },
        };
      }}
    />
  );
};
