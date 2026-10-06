/**
 * Turns an uploaded photograph into search terms for the existing catalogue
 * search.
 *
 * The cheap half of image search, and deliberately so. The expensive approach —
 * embedding all 1,068,225 product images and doing nearest-neighbour lookups —
 * buys visual similarity, which this business does not actually need: the
 * catalogue is a demonstrator of what can be sourced, not stock, so "find me
 * products of this kind" is the right answer and "find me this exact photo" is
 * not. pgvector 0.8.6 is available on the Neon instance if that ever changes,
 * but it costs a one-off backfill and roughly 1.3GB of storage, and there is no
 * point spending either until uploads prove people want it.
 *
 * Two providers, because the choice here is mostly about price rather than
 * capability — naming an object in a photo is not a hard task, and a free tier
 * does it perfectly well:
 *
 *   gemini     GEMINI_API_KEY     free tier, no card to start   <- default
 *   anthropic  ANTHROPIC_API_KEY  paid, best quality
 *
 * Whichever key is present is used; set AI_PROVIDER to force one when both are.
 * Neither needs an SDK — one fetch each, matching how the CJ client in this
 * repo is written.
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Cheap and fast matters more than depth: the task is naming an object, it
 *  runs once per upload, and a user is waiting on it.
 *
 *  Both defaults are measured, not assumed. On this key, against a real product
 *  photo: gemini-3.1-flash-lite answered in 1.6s with no thinking tokens, while
 *  gemini-3.6-flash took 74s because it reasons first — same correct answer, 46
 *  times slower, for a task that is just naming an object. gemini-2.5-flash and
 *  -lite are listed by the models endpoint but return 404 to this key, so the
 *  listing is not a reliable guide to what is callable.
 *
 *  maxOutputTokens is 800 rather than 300 because thinking tokens are drawn
 *  from the same budget: at 300 a reasoning model spent 286 on thought, left 7
 *  for the answer, and returned truncated JSON with finishReason MAX_TOKENS.
 *  Lite models ignore the headroom, so it costs nothing to leave it there.
 *
 *  Measured again 2026-10-06, after "the scanner is very slow": gemini-3.5-flash
 *  (then first) answered 429 at once on every photo, its quota spent, so each
 *  search lost a round trip before the model that worked; flash-latest was 503.
 *  gemini-3.5-flash-lite, with no thinking config at all, answered in 1.6–4.0s
 *  against 3.0–5.9s for gemini-3.1-flash-lite; image size made no difference
 *  (a fixed ~1,400 tokens), nor did a shorter answer. The two lite models are
 *  raced: each has its own free-tier quota, so racing spreads the load rather
 *  than doubling it on one, and whichever is quicker (or not busy) wins. */
const GEMINI_RACE = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
/** Tried one after the other only if both raced models fail. */
const GEMINI_FALLBACK = ["gemini-flash-latest", "gemini-3.5-flash"] as const;
/** Models that refuse `thinkingBudget` (400 "invalid argument"): the 3.5 generation takes thinkingLevel, and none at all is quickest. */
const NO_THINKING_BUDGET = new Set<string>(["gemini-3.5-flash-lite", "gemini-3.5-flash"]);
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * What the vision providers can be handed directly. Deliberately short: both
 * Gemini and Anthropic document PNG, JPEG and WebP, and anything outside that
 * is a 400 from the API rather than a graceful degradation.
 */
export const PROVIDER_NATIVE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * What the UPLOAD accepts, which is deliberately much wider. Everything not in
 * PROVIDER_NATIVE_TYPES is transcoded to JPEG server-side before it reaches a
 * provider (see normaliseForProvider), so the user is not made to care which
 * codec their phone or screenshot tool happened to use.
 *
 * AVIF is verified working: sharp decodes it through libheif and reports the
 * format as "heif". HEIC/HEIF are accepted on the same code path — sharp cannot
 * ENCODE them, HEVC being patent-encumbered, but decoding is all that is needed
 * and it is what phone cameras produce.
 *
 * SVG is excluded on purpose. It is a document format rather than a photograph,
 * nobody photographs a product as SVG, and rasterising untrusted markup is an
 * attack surface this feature has no reason to take on.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Longest edge sent to the provider. Vision models downscale internally
 *  anyway, so anything larger is upload time and tokens spent for nothing.
 *  1024, not 1568: Gemini 3 bills an image at a fixed ~1,400 tokens and
 *  answered as well from 512px as from 1000px (measured 2026-10-06), so the
 *  extra pixels only lengthened the request. The page sends 1024 already. */
const MAX_EDGE = 1024;

/** One thing in the photo that can be bought, as the model saw it. */
export type DetectedItem = {
  /** What to call it on a chip: "Football jersey". */
  label: string;
  /** What to search the catalogue for: "red football jersey". */
  query: string;
  /** Keywords, most distinctive first. */
  terms: string[];
  /** Where it is: [ymin, xmin, ymax, xmax], each 0–1000 of the upright image. Null when not given or not sane. */
  box: [number, number, number, number] | null;
};

export type ImageDescription = {
  /** Short noun phrase, e.g. "digital tyre pressure gauge": the first item's query. */
  productType: string;
  /** Terms to search the catalogue with, most distinctive first: the first item's. */
  terms: string[];
  /** false when nothing in the picture can be bought — a landscape, a
   *  document. Lets the caller say so rather than return nonsense results. */
  isProduct: boolean;
  /** Everything purchasable in it, most prominent first (at most four). */
  items: DetectedItem[];
};

export class ImageSearchUnavailable extends Error {}

/** The upload was accepted but could not be decoded — a truncated file, or a
 *  codec this build of libvips was not compiled with. Distinct from a rejected
 *  MIME type, because the advice to the user is different. */
export class ImageDecodeFailed extends Error {}

/**
 * Hand back something a vision provider will definitely accept.
 *
 * PNG, JPEG and WebP pass straight through untouched unless they are oversized.
 * Everything else — AVIF, HEIC, GIF, TIFF, BMP — is decoded and re-encoded as
 * JPEG. Without this, widening the upload filter would only move the failure
 * from the browser to the provider, which answers 400 for a format it does not
 * know and gives the user nothing useful.
 *
 * sharp is imported lazily so it is only pulled in when a conversion is
 * actually needed, and never at module load.
 */
export async function normaliseForProvider(
  input: Buffer,
  mediaType: string,
): Promise<{ base64: string; mediaType: string }> {
  const native = (PROVIDER_NATIVE_TYPES as readonly string[]).includes(mediaType);

  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(input, { animated: false });
    const meta = await image.metadata();
    const oversized = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE;

    // Decide from the decoded bytes, not from what the upload claimed. File
    // pickers routinely report an empty type or application/octet-stream for
    // AVIF and HEIC, so the declared value is a hint at best.
    const detected =
      meta.format === "jpeg" ? "image/jpeg" :
      meta.format === "png" ? "image/png" :
      meta.format === "webp" ? "image/webp" :
      null;
    // A photo stored sideways with an EXIF turn is drawn upright by the
    // browser; the model must see it upright too, or the boxes it returns
    // land on the wrong part of the picture the shopper sees.
    const turned = !!meta.orientation && meta.orientation !== 1;

    if (detected && !oversized && !turned) {
      return { base64: input.toString("base64"), mediaType: detected };
    }

    const out = await image
      .rotate() // honour EXIF orientation, or phone photos arrive sideways
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    return { base64: out.toString("base64"), mediaType: "image/jpeg" };
  } catch (error) {
    // A native type that sharp could not read is still worth trying as-is: the
    // provider may well decode it, and failing here would be worse.
    if (native) return { base64: input.toString("base64"), mediaType };
    throw new ImageDecodeFailed(error instanceof Error ? error.message : "could not decode image");
  }
}

/** Provider is up but would not serve this request — 429 rate limit, or the
 *  503 UNAVAILABLE the free tier returns when a model is saturated. Transient
 *  by definition, and worth telling the user apart from "that image is no
 *  good", which is what it used to be reported as. */
export class ImageSearchBusy extends Error {}

function isTransient(status: number) {
  return status === 429 || status === 529 || status >= 500;
}

/*
 * The products in a photo, not "is this photo a product". The first version
 * asked the latter and told the model a person is not a product, so a
 * footballer in a red jersey came back "That does not look like a product"
 * (reported 2026-10-06): the jersey is exactly what the shopper wants found.
 * Now every purchasable thing in view counts, worn and held ones included,
 * each with where it is, so the page can draw it and let the shopper pick.
 */
// The shape by example, not by type: given `{"label": string, …}` the 3.5
// lite model once echoed it back word for word. No keyword lists: nothing
// reads them any more, and they were half of every answer.
const PROMPT = `You find the products in photographs so they can be looked up in a B2B sourcing catalogue.

Reply with ONLY compact JSON on one line, no prose, no code fences, in this shape:
{"items":[{"label":"Office chair","query":"black leather office chair","box":[120,80,940,610]}]}

Rules:
- List the physical things in the photo that someone could buy, most prominent first, at most 4. Things a person is wearing, holding or using count: in a photo of a footballer, the jersey, the shorts and the boots are the products.
- "label": 1 to 3 words naming the thing, e.g. "Football jersey", "Running shoes", "Desk lamp".
- "query": a short catalogue search for it: a generic noun with at most two visible attributes such as colour, material or style, e.g. "red football jersey", "white leather sneakers", "LED desk lamp".
- "box": where the item is, as [ymin, xmin, ymax, xmax], each scaled 0 to 1000.
- Never identify or name a person. Never use a brand, team, club, logo or character name; describe only what the item is.
- Do not guess price, size, dimensions, model numbers or country of origin.
- If nothing in the photo can be bought (scenery, a page of text, a blank screen), reply {"items":[]}.`;

type Provider = "gemini" | "anthropic";

function resolveProvider(): { provider: Provider; apiKey: string } {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase();
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  if (forced === "gemini" && gemini) return { provider: "gemini", apiKey: gemini };
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", apiKey: anthropic };
  // Free one first when nothing is forced — there is no quality reason to
  // spend money on this particular task.
  if (gemini) return { provider: "gemini", apiKey: gemini };
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };

  throw new ImageSearchUnavailable("Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY");
}

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

/** An answer worth stopping for: JSON with an item list (an echo of the prompt's shape, or a refusal in prose, is not). */
function looksAnswered(text: string): boolean {
  const j = extractJson(text) as { items?: unknown } | null;
  return !!j && typeof j === "object" && Array.isArray(j.items);
}

async function callGemini(key: string, base64: string, mediaType: string, signal?: AbortSignal) {
  // A single model is a single point of failure on a free tier: capacity moves
  // around, and a saturated model answers 503 UNAVAILABLE while its siblings
  // are fine. So two are raced, and the rest are fallbacks (see GEMINI_RACE).
  const override = process.env.IMAGE_SEARCH_MODEL;
  const race: string[] = override ? [override] : [...GEMINI_RACE];
  const fallback: string[] = override ? [] : [...GEMINI_FALLBACK];

  /** One model's answer: its text, or the status it refused with (0: no answer at all, or none worth having). */
  async function ask(model: string, stop?: AbortSignal): Promise<{ text: string } | { status: number }> {
    try {
      const perModelSignals = [AbortSignal.timeout(7_000)];
      if (signal) perModelSignals.push(signal);
      if (stop) perModelSignals.push(stop);
      const combinedSignal = AbortSignal.any(perModelSignals);

      const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
        method: "POST",
        signal: combinedSignal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: "List the products in this photo for a catalogue search." },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 800,
            temperature: 0,
            ...(NO_THINKING_BUDGET.has(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
          },
        }),
      });

      if (res.ok) {
        const payload = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = (payload.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (looksAnswered(text)) return { text };
        console.warn(`Image search: ${model} answered without an item list: ${text.slice(0, 120)}`);
        return { status: 0 };
      }

      const detail = await res.text().catch(() => "");
      if (!isTransient(res.status)) {
        // 400, 403, 404 — a wrong model name or a rejected key.
        console.warn(`Image search: ${model} rejected with ${res.status}: ${detail.slice(0, 200)}`);
      } else {
        console.warn(`Image search: ${model} returned ${res.status}, trying next model.`);
      }
      return { status: res.status };
    } catch (err) {
      if (stop?.aborted) return { status: 0 }; // lost the race: not a failure
      console.warn(`Image search: ${model} attempt failed (${err instanceof Error ? err.message : String(err)}), trying next model.`);
      return { status: 0 };
    }
  }

  /** The first good answer of several models asked at once; the rest are stopped. */
  function first(models: string[]): Promise<{ text: string } | { statuses: number[] }> {
    const stop = new AbortController();
    return new Promise((resolve) => {
      const statuses: number[] = [];
      let left = models.length;
      for (const model of models) {
        void ask(model, stop.signal).then((answer) => {
          if ("text" in answer) {
            stop.abort();
            resolve(answer);
          } else {
            statuses.push(answer.status);
            if (--left === 0) resolve({ statuses });
          }
        });
      }
    });
  }

  let lastStatus = 0;
  // Twice round, a beat apart, when every model was only busy: a free tier's
  // saturation comes and goes in seconds (measured 2026-10-06: uploads in a
  // quick run came back 429/503 from all of them, one a little later was
  // fine), so a short wait turns most "busy" answers into a slower result.
  for (let round = 0; round < 2; round++) {
    if (round > 0) {
      if (signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (signal?.aborted) break;
    }
    let onlyBusy = true;
    const raced = await first(race);
    if ("text" in raced) return raced.text;
    for (const s of raced.statuses) {
      if (s) lastStatus = s;
      if (s && !isTransient(s)) onlyBusy = false;
    }
    for (const model of fallback) {
      if (signal?.aborted) break;
      const answer = await ask(model);
      if ("text" in answer) return answer.text;
      if (answer.status) lastStatus = answer.status;
      if (answer.status && !isTransient(answer.status)) onlyBusy = false;
    }
    if (!onlyBusy) break;
  }

  throw new ImageSearchBusy(`All Gemini models were unavailable (last status ${lastStatus}).`);
}

async function callAnthropic(key: string, base64: string, mediaType: string, signal?: AbortSignal) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: process.env.IMAGE_SEARCH_MODEL || ANTHROPIC_MODEL,
      // Four items with boxes run to ~250 tokens; 300 was sized for one.
      max_tokens: 700,
      system: PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "List the products in this photo for a catalogue search." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (isTransient(res.status)) {
      throw new ImageSearchBusy(`Anthropic API ${res.status}`);
    }
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (payload.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

/**
 * @param base64  raw base64, no data: prefix
 * @param mediaType  one of ACCEPTED_IMAGE_TYPES
 * @throws ImageSearchUnavailable when no provider key is configured
 */
export async function describeProductImage(
  base64: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<ImageDescription> {
  const { provider, apiKey } = resolveProvider();

  const text =
    provider === "gemini"
      ? await callGemini(apiKey, base64, mediaType, signal)
      : await callAnthropic(apiKey, base64, mediaType, signal);

  return readDescription(extractJson(text));
}

/** Words, trimmed and capped, from what may not be a list of strings at all. */
function strings(value: unknown, max: number, len: number): string[] {
  return Array.isArray(value)
    ? value.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, len)).filter(Boolean).slice(0, max)
    : [];
}

/** A box only if it is four numbers that make a box inside the picture. */
function readBox(value: unknown): DetectedItem["box"] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [y0, x0, y1, x1] = (value as number[]).map((n) => Math.max(0, Math.min(1000, Math.round(n))));
  return y1 - y0 >= 20 && x1 - x0 >= 20 ? [y0, x0, y1, x1] : null;
}

/**
 * The model's answer, as data the rest of the app can trust: it is untrusted
 * input, and it flows into the catalogue search. Takes the item list, or the
 * older one-product shape ({isProduct, productType, terms}) should a model
 * answer that way.
 */
export function readDescription(parsed: unknown): ImageDescription {
  const none: ImageDescription = { isProduct: false, productType: "", terms: [], items: [] };
  if (!parsed || typeof parsed !== "object") return none;
  const p = parsed as Record<string, unknown>;
  const items: DetectedItem[] = [];
  const seen = new Set<string>();
  const raw = Array.isArray(p.items) ? p.items : typeof p.productType === "string" && p.isProduct !== false ? [{ label: p.productType, query: p.productType, terms: p.terms }] : [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const query = typeof r.query === "string" ? r.query.trim().slice(0, 80) : "";
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 40) : query;
    const terms = strings(r.terms, 6, 40);
    const q = query || terms.join(" ");
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    items.push({ label: label || q, query: q, terms, box: readBox(r.box) });
    if (items.length >= 4) break;
  }
  if (!items.length) return none;
  return { isProduct: true, productType: items[0].query, terms: items[0].terms.length ? items[0].terms : [items[0].query], items };
}

/** A link to an image that this server will not fetch: not http(s), or pointing inside a network. */
export class RemoteImageRefused extends Error {}

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./];
function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return PRIVATE_V4.some((r) => r.test(v));
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

async function checkRemote(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new RemoteImageRefused("Only http and https links can be searched.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) throw new RemoteImageRefused("That link points inside a private network.");
  const { lookup } = await import("node:dns/promises");
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
  const addresses = isIp ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new RemoteImageRefused("That link points inside a private network.");
}

/**
 * Fetches an image a shopper linked to (a pasted or dropped image link),
 * the way a server should fetch a stranger's URL: http(s) only, never an
 * address inside a network (checked again at every redirect), an image
 * content type, and no more than MAX_IMAGE_BYTES read. The first version
 * fetched whatever URL arrived.
 */
export async function fetchRemoteImage(link: string): Promise<{ buffer: Buffer; mediaType: string }> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new RemoteImageRefused("That is not a link.");
  }
  const deadline = AbortSignal.timeout(6_000);
  for (let hop = 0; hop < 4; hop++) {
    await checkRemote(url);
    const res = await fetch(url, { redirect: "manual", signal: deadline, headers: { accept: "image/*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location") as string, url);
      continue;
    }
    if (!res.ok || !res.body) throw new RemoteImageRefused("That image could not be loaded.");
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type && !type.startsWith("image/")) throw new RemoteImageRefused("That link is not an image.");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new RemoteImageRefused("That image is over 5MB.");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new RemoteImageRefused("That image is over 5MB.");
      }
      chunks.push(value);
    }
    return { buffer: Buffer.concat(chunks), mediaType: type || "image/jpeg" };
  }
  throw new RemoteImageRefused("That link redirects too many times.");
}
