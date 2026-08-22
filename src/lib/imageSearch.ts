/**
 * Turns an uploaded photograph into search terms for the existing catalogue
 * search.
 *
 * The cheap half of image search, and deliberately so. The expensive approach
 * — embedding all 1,068,225 product images and doing nearest-neighbour lookups
 * — buys visual similarity, which this business does not actually need: the
 * catalogue is a demonstrator of what can be sourced, not stock, so "find me
 * products of this kind" is the right answer and "find me this exact photo" is
 * not. pgvector 0.8.6 is available on the Neon instance if that ever changes,
 * but it costs a one-off backfill and roughly 1.3GB of storage, and there is no
 * point spending either until uploads prove people want it.
 *
 * No SDK. One fetch against the Messages API keeps this dependency-free, which
 * matches how the CJ client in this repo is written.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Cheap and fast matters more than depth here: the task is naming an object,
 *  it runs once per upload, and latency is in front of a waiting user. */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageDescription = {
  /** Short noun phrase, e.g. "digital tyre pressure gauge". */
  productType: string;
  /** Terms to search the catalogue with, most distinctive first. */
  terms: string[];
  /** false when the picture is not a product at all — a face, a document, a
   *  landscape. Lets the caller say so rather than return nonsense results. */
  isProduct: boolean;
};

export class ImageSearchUnavailable extends Error {}

const SYSTEM_PROMPT = `You identify products in photographs so they can be looked up in a B2B sourcing catalogue.

Reply with ONLY a JSON object, no prose and no code fences:
{"isProduct": boolean, "productType": string, "terms": string[]}

Rules:
- "productType" is a short generic noun phrase for the object: "digital tyre pressure gauge", "cotton tote bag", "LED ceiling panel".
- "terms" is 3 to 6 short search keywords, most distinctive first. Generic nouns a catalogue would use, not a sentence.
- Describe only what is visibly there. Do not guess brand, price, material, dimensions or country of origin.
- If the image is not a physical product (a person, a document, a screenshot, scenery), set isProduct false, productType "", terms [].
- Never invent a model number or a manufacturer.`;

function extractJson(text: string): unknown {
  // The model is asked for bare JSON, but a stray fence or leading sentence
  // should degrade to "no results" rather than a 500.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param base64  raw base64, no data: prefix
 * @param mediaType  one of ACCEPTED_IMAGE_TYPES
 * @throws ImageSearchUnavailable when no API key is configured
 */
export async function describeProductImage(
  base64: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<ImageDescription> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ImageSearchUnavailable("ANTHROPIC_API_KEY is not set");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: process.env.IMAGE_SEARCH_MODEL || DEFAULT_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Identify this product for a catalogue search." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (payload.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");

  const parsed = extractJson(text) as Partial<ImageDescription> | null;
  if (!parsed || typeof parsed !== "object") {
    return { isProduct: false, productType: "", terms: [] };
  }

  // Everything below is defensive: the response is untrusted input as far as
  // the rest of the app is concerned, and it flows into a SQL search builder.
  const terms = Array.isArray(parsed.terms)
    ? parsed.terms
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    isProduct: parsed.isProduct === true && terms.length > 0,
    productType: typeof parsed.productType === "string" ? parsed.productType.trim().slice(0, 80) : "",
    terms,
  };
}
