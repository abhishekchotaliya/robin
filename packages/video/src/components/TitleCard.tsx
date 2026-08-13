import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, "Helvetica Neue", sans-serif';

/** The scene's optional on-screen title — written text, never narrated. */
export const TitleCard: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // A short rise-and-settle so the title arrives rather than snapping in.
  const progress = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: height * 0.12,
        paddingLeft: "8%",
        paddingRight: "8%",
        opacity: progress,
        transform: `translateY(${(1 - progress) * 24}px)`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontSize: height * 0.045,
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.15,
          textShadow: "0 2px 16px rgba(0,0,0,0.8)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
