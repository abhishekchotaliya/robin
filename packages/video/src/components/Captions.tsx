import type { RenderManifest } from "@app/core";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, "Helvetica Neue", sans-serif';

/**
 * Word-by-word captions.
 *
 * Lines are grouped once, at manifest-compile time — grouping them here
 * would redo the work on every frame at 30fps, which is a real performance
 * trap. This component only picks the active line and highlights the word
 * whose span contains the current time.
 */
export const Captions: React.FC<{ captions: RenderManifest["captions"] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  if (!captions.enabled || captions.lines.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const line =
    captions.lines.find((l) => currentMs >= l.startMs && currentMs <= l.endMs) ??
    // Between lines, hold the one just finished so captions don't flicker
    // off during short pauses between words.
    captions.lines.findLast((l) => l.endMs < currentMs && currentMs - l.endMs < 400);

  if (!line) return null;

  const isLower = captions.style === "subtle-lower";
  const fontSize = isLower ? height * 0.038 : height * 0.052;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        // Captions sit at ~60% height for the bold style: clear of the
        // subject's face, clear of platform UI along the bottom edge.
        paddingTop: isLower ? height * 0.8 : height * 0.6,
        paddingLeft: "8%",
        paddingRight: "8%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: `${fontSize * 0.28}px`,
          justifyContent: "center",
          fontFamily: FONT_STACK,
          fontSize,
          fontWeight: isLower ? 600 : 800,
          lineHeight: 1.15,
          textAlign: "center",
        }}
      >
        {line.words.map((word, index) => {
          const active = currentMs >= word.startMs && currentMs <= word.endMs;
          return (
            <span
              key={`${word.startMs}-${index}`}
              style={{
                color: active ? "#fde047" : "#ffffff",
                // Scaling the active word reads as emphasis even muted.
                transform: active ? "scale(1.06)" : "scale(1)",
                display: "inline-block",
                textShadow: "0 2px 12px rgba(0,0,0,0.75), 0 0 3px rgba(0,0,0,0.9)",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
