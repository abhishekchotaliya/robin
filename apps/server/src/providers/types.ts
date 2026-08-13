import type { Asset, Settings, VoiceOption } from "@app/core";

/**
 * Capability interfaces. New capabilities arrive as a provider implementation
 * plus a registry entry — never as a change to services/ or the pipeline.
 * All four are defined now even though only TTS has an implementation, so
 * the shape is fixed before a second one shows up and bends it.
 */

export interface SynthesizeOptions {
  voiceId: string;
  speed: number;
  stability: number;
}

export interface TTSProvider {
  readonly id: string;
  readonly label: string;
  /** Whether the settings hold what this provider needs (an API key, usually). */
  isConfigured(settings: Settings): boolean;
  listVoices(settings: Settings): Promise<VoiceOption[]>;
  synthesize(text: string, opts: SynthesizeOptions, settings: Settings): Promise<ArrayBuffer>;
}

export interface ImageProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(settings: Settings): boolean;
  generate(prompt: string, opts: Record<string, unknown>, settings: Settings): Promise<Asset>;
}

export interface VideoProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(settings: Settings): boolean;
  generate(prompt: string, opts: Record<string, unknown>, settings: Settings): Promise<Asset>;
}

export interface StockProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(settings: Settings): boolean;
  search(query: string, settings: Settings): Promise<Asset[]>;
}
