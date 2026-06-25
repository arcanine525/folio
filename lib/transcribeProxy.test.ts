import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUDIO_MIME,
  buildUpstreamForm,
  MAX_AUDIO_BYTES,
  validateAudioFile,
  WHISPER_MODEL,
  WHISPER_URL,
} from "@/lib/transcribeProxy";

function audio(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("transcribeProxy helpers", () => {
  it("targets the Whisper endpoint with the whisper-1 model", () => {
    expect(WHISPER_URL).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(WHISPER_MODEL).toBe("whisper-1");
  });

  it("allows exactly the documented audio MIME types", () => {
    expect([...ALLOWED_AUDIO_MIME]).toEqual([
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
      "audio/m4a",
      "audio/webm",
      "audio/ogg",
    ]);
  });

  it("accepts a valid audio file under the size cap", () => {
    const file = audio("clip.m4a", "audio/m4a", 1024);
    const res = validateAudioFile(file);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.file).toBe(file);
  });

  it("rejects a non-File value with 400", () => {
    expect(validateAudioFile("not a file")).toEqual({
      ok: false,
      status: 400,
      error: expect.any(String),
    });
    const n = validateAudioFile(null);
    if (!n.ok) expect(n.status).toBe(400);
    const u = validateAudioFile(undefined);
    if (!u.ok) expect(u.status).toBe(400);
  });

  it("rejects an unsupported MIME type with 415", () => {
    const res = validateAudioFile(audio("notes.txt", "text/plain"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(415);
  });

  it("rejects an empty MIME type with 415", () => {
    const res = validateAudioFile(audio("blob", ""));
    if (!res.ok) expect(res.status).toBe(415);
  });

  it("rejects a file exactly one byte over the cap with 413", () => {
    const res = validateAudioFile(audio("big.mp3", "audio/mpeg", MAX_AUDIO_BYTES + 1));
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("accepts a file exactly at the cap boundary", () => {
    const res = validateAudioFile(audio("edge.m4a", "audio/m4a", MAX_AUDIO_BYTES));
    expect(res.ok).toBe(true);
  });

  it("buildUpstreamForm appends the file (preserving its name) and the model", async () => {
    const file = audio("meeting.mp3", "audio/mpeg");
    const form = await buildUpstreamForm(file);
    expect(form.get("model")).toBe(WHISPER_MODEL);
    const forwarded = form.get("file");
    expect(forwarded).toBeInstanceOf(File);
    expect((forwarded as File).name).toBe("meeting.mp3");
  });
});
