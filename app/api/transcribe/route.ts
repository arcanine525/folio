// /api/transcribe — server-side Whisper proxy (P3.3). Forwards multipart audio
// to OpenAI's transcriptions endpoint using the server key; the key never
// reaches the browser. Non-2xx upstream responses are passed through unchanged.
// See docs/plan.md §3.3.

import {
  buildUpstreamForm,
  validateAudioFile,
  WHISPER_URL,
} from "@/lib/transcribeProxy";

// Multipart upload + remote transcription → never prerendered/cached, and may
// run long enough to need the 120s maxDuration set in vercel.json.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

export async function POST(req: Request): Promise<Response> {
  // P3.3.2 — parse multipart/form-data and pull the `file` field.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Invalid multipart body" });
  }

  // P3.3.3 + P3.3.4 — validate MIME type and size.
  const check = validateAudioFile(form.get("file"));
  if (!check.ok) return json(check.status, { error: check.error });

  // Server-side key only; never echoed to the response or logs.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Transcription proxy not configured" });
  }

  // P3.3.5 — forward the FormData to Whisper.
  const upstream = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: await buildUpstreamForm(check.file),
  });

  // Non-2xx upstream response: pass status + body through unchanged.
  if (!upstream.ok) {
    return new Response(upstream.body, { status: upstream.status });
  }

  // P3.3.6 — surface just the transcript text.
  const data = (await upstream.json()) as { text?: string };
  return json(200, { text: typeof data.text === "string" ? data.text : "" });
}
