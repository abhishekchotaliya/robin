import { NotFoundError } from "../lib/errors.ts";
import { elevenLabsProvider } from "./tts/elevenlabs.ts";
import { macosSayProvider } from "./tts/macos-say.ts";
import type { ImageProvider, StockProvider, TTSProvider, VideoProvider } from "./types.ts";

// Adding a provider is a new file plus one line here. Nothing in services/
// or the pipeline should ever need to know which implementation is in use.
export const ttsProviders = new Map<string, TTSProvider>([
  [elevenLabsProvider.id, elevenLabsProvider],
  [macosSayProvider.id, macosSayProvider],
]);

export const imageProviders = new Map<string, ImageProvider>();
export const videoProviders = new Map<string, VideoProvider>();
export const stockProviders = new Map<string, StockProvider>();

export function getTTSProvider(providerId: string): TTSProvider {
  const provider = ttsProviders.get(providerId);
  if (!provider) throw new NotFoundError(`no TTS provider registered with id "${providerId}"`);
  return provider;
}
