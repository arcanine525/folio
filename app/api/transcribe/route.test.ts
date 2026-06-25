import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/transcribe/route";
import { MAX_AUDIO_BYTES, WHISPER_URL } from "@/lib/transcribeProxy";

interface StubFile {
  name: string;
  type: string;
  size: number;
}

/**
 * Build a real multipart/form-data body for the request. We construct the raw
 * multipart text (with a boundary + matching content-type) rather than using
 * `new FormData()` as a Request body, because in the jsdom test environment the
 * global `FormData` (jsdom) and `Request` (undici) live in different realms and
 * the body round-trip loses the file's bytes/size. undici parses this raw body
 * back into a File of the correct size, exactly as a real client upload would.
 */
function buildMultipart(file: StubFile | null): { body: string; contentType: string } {
  const boundary = "----folio-test-boundary";
  if (!file) {
    return {
      body: `--${boundary}--\r\n`,
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${file.name}"`,
    `Content-Type: ${file.type}`,
    "",
    "\0".repeat(file.size),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function buildReq(file: StubFile | null): Request {
  const { body, contentType } = buildMultipart(file);
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

describe("app/api/transcribe route", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards a valid audio file to Whisper and returns { text }", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "hello world" }), { status: 200 }),
    );

    const res = await POST(buildReq({ name: "clip.mp3", type: "audio/mpeg", size: 1024 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello world" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WHISPER_URL);
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer sk-test");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("whisper-1");
  });

  it("returns 400 when the `file` field is missing", async () => {
    const res = await POST(buildReq(null));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 for an unsupported MIME type", async () => {
    const res = await POST(buildReq({ name: "doc.txt", type: "text/plain", size: 10 }));
    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a file over the size cap", async () => {
    const res = await POST(
      buildReq({ name: "big.mp3", type: "audio/mpeg", size: MAX_AUDIO_BYTES + 1 }),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when OPENAI_API_KEY is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await POST(buildReq({ name: "clip.mp3", type: "audio/mpeg", size: 1024 }));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a non-2xx upstream status through unchanged", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "bad audio" }), { status: 400 }),
    );
    const res = await POST(buildReq({ name: "clip.mp3", type: "audio/mpeg", size: 1024 }));
    expect(res.status).toBe(400);
  });

  it("returns an empty text string when Whisper omits `text`", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const res = await POST(buildReq({ name: "clip.mp3", type: "audio/mpeg", size: 1024 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "" });
  });
});
