// Pure helpers for the /api/transcribe Whisper proxy route (P3.3).
// Kept side-effect free so they are unit-testable without network access.
// Mirrors the lib/aiProxy.ts pattern used by /api/ai. See docs/plan.md §3.3.

/** Whisper transcriptions endpoint (server-side only). */
export const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
/** Whisper model id forwarded with every request. */
export const WHISPER_MODEL = "whisper-1";

/** Allowed audio MIME types (P3.3.3). */
export const ALLOWED_AUDIO_MIME: readonly string[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
];

/** 25 MB upload ceiling (P3.3.4). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioCheck =
  | { ok: true; file: File }
  | { ok: false; status: number; error: string };

/**
 * True if `value` is a Blob-like object carrying a name (i.e. a `File`). We
 * duck-type rather than rely on `instanceof File` so the check is robust across
 * realms — `Request.formData()` reconstructs files in the runtime's realm, which
 * may differ from the global `File` (e.g. jsdom vs undici in tests, or edge vs
 * node realms in production).
 */
function isFileLike(value: unknown): value is File {
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (value == null || typeof value !== "object") return false;
  const v = value as { arrayBuffer?: unknown; name?: unknown; size?: unknown };
  return (
    typeof v.arrayBuffer === "function" &&
    typeof v.name === "string" &&
    typeof v.size === "number"
  );
}

/**
 * Validate the uploaded audio file's type and size. Never throws.
 * - 400 when the `file` field is missing / not a File
 * - 415 for an unsupported MIME type
 * - 413 when the file exceeds {@link MAX_AUDIO_BYTES}
 */
export function validateAudioFile(file: unknown): AudioCheck {
  if (!isFileLike(file)) {
    return { ok: false, status: 400, error: "Missing or invalid `file` field" };
  }
  if (!ALLOWED_AUDIO_MIME.includes(file.type)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported audio type: ${file.type || "unknown"}`,
    };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `File too large (${file.size} bytes > ${MAX_AUDIO_BYTES})`,
    };
  }
  return { ok: true, file };
}

/**
 * Build the multipart FormData forwarded to Whisper (file + model). The blob is
 * re-created in the current realm so `FormData.append` accepts it even when
 * `file` was reconstructed by a different runtime (jsdom vs undici in tests, or
 * edge vs node realms in production). Whisper needs the full file regardless, so
 * buffering it once is cheap.
 */
export async function buildUpstreamForm(
  file: File,
  model: string = WHISPER_MODEL,
): Promise<FormData> {
  const form = new FormData();
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], {
    type: file.type || "application/octet-stream",
  });
  form.append("file", blob, file.name || "audio");
  form.append("model", model);
  return form;
}
