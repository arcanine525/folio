// Folio — AI response cache key (P4.7.1).
//
// A SHA-256 of the model's actual inputs (context content + system prompt +
// user message) so an identical request replays its cached response instead of
// calling the provider again. Each part is length-prefixed, so "ab"+"c" and
// "a"+"bc" (or any content that swallows a separator) can never collide.

/** Compute a hex SHA-256 digest of the given input parts. */
export async function computeCacheKey(...parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const serialized = parts.map((p) => `${p.length}:${p}`).join("|");
  const data = encoder.encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

/** Lowercase hex string of an ArrayBuffer. */
function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
