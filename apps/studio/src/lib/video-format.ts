import type { FormatPreset, FpsOption, ResolutionTier } from "@app/core";

// Shared between the New Project dialog (initial pick) and the Render tab
// (change it later) so the two pickers can't drift apart.
export const ASPECT_OPTIONS: { value: FormatPreset; label: string; aspect: string }[] = [
  { value: "shorts", label: "Shorts", aspect: "9:16" },
  { value: "landscape", label: "Landscape", aspect: "16:9" },
  { value: "square", label: "Square", aspect: "1:1" },
];

export const RESOLUTION_OPTIONS: { value: ResolutionTier; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

export const FPS_OPTIONS: { value: FpsOption; label: string }[] = [
  { value: 30, label: "30 fps" },
  { value: 60, label: "60 fps" },
  { value: 120, label: "120 fps" },
];
