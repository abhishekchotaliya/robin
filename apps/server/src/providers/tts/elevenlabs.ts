import { VoiceOptionSchema, type Settings, type VoiceOption } from "@app/core";
import { ApiHttpError } from "../../lib/errors.ts";
import type { SynthesizeOptions, TTSProvider } from "../types.ts";

const API_BASE = "https://api.elevenlabs.io";
// Voice listing moved to v2; synthesis is still v1. Not a typo.
const VOICES_URL = `${API_BASE}/v2/voices`;
const TTS_URL = `${API_BASE}/v1/text-to-speech`;

const MODEL_ID = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

function requireApiKey(settings: Settings): string {
  const key = settings.providers.elevenlabs?.apiKey;
  if (!key) {
    throw new ApiHttpError(
      "VALIDATION",
      "ElevenLabs API key is not configured. Add it in Settings before generating voiceover.",
      400,
    );
  }
  return key;
}

// Turns any non-2xx into our uniform error shape with something the user can
// act on, rather than leaking a raw provider response into a 500.
async function failFromResponse(res: Response, action: string): Promise<never> {
  const body = await res.text().catch(() => "");
  if (res.status === 401) {
    throw new ApiHttpError("VALIDATION", "ElevenLabs rejected the API key (401). Check it in Settings.", 400);
  }
  if (res.status === 429) {
    throw new ApiHttpError("CONFLICT", "ElevenLabs rate limit reached. Try again shortly.", 409);
  }
  throw new ApiHttpError(
    "INTERNAL",
    `ElevenLabs ${action} failed (${res.status}): ${body.slice(0, 300) || res.statusText}`,
    500,
  );
}

export const elevenLabsProvider: TTSProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",

  isConfigured(settings) {
    return Boolean(settings.providers.elevenlabs?.apiKey);
  },

  async listVoices(settings): Promise<VoiceOption[]> {
    const res = await fetch(`${VOICES_URL}?page_size=100`, {
      headers: { "xi-api-key": requireApiKey(settings) },
    });
    if (!res.ok) await failFromResponse(res, "voice listing");

    const body = (await res.json()) as {
      voices?: Array<{
        voice_id?: string;
        name?: string;
        category?: string;
        description?: string;
        preview_url?: string;
        labels?: Record<string, string>;
      }>;
    };

    return (body.voices ?? [])
      .filter((v) => typeof v.voice_id === "string")
      .map((v) =>
        VoiceOptionSchema.parse({
          id: v.voice_id,
          name: v.name ?? "Unnamed voice",
          category: v.category ?? null,
          description: v.description ?? null,
          previewUrl: v.preview_url ?? null,
          labels: v.labels ?? {},
        }),
      );
  },

  async synthesize(text: string, opts: SynthesizeOptions, settings): Promise<ArrayBuffer> {
    const apiKey = requireApiKey(settings);
    if (!opts.voiceId) {
      throw new ApiHttpError("VALIDATION", "No voice selected. Pick one in the Audio tab first.", 400);
    }

    const res = await fetch(`${TTS_URL}/${encodeURIComponent(opts.voiceId)}?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: opts.stability,
          similarity_boost: 0.75,
          speed: opts.speed,
        },
      }),
    });
    if (!res.ok) await failFromResponse(res, "synthesis");

    return res.arrayBuffer();
  },
};
