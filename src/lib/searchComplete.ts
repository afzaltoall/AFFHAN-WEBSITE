import { nameWords, stem, typedWords, type CategoryIndex, type CategoryHit } from "./searchIntent";

/**
 * Search as you type, the way Amazon and Flipkart do it: what the words
 * typed so far are most likely the start of, from the catalogue's own
 * phrases (searchLexicon.json, built by scripts/build_search_lexicon.mjs),
 * most common first; and the categories whose names start that way. Pure,
 * so it runs in the browser on every keystroke with nothing to wait for,
 * and on the server for anything that asks the API instead.
 *
 * The last word is taken as still being typed unless the text ends with a
 * space. A word typed whole beats a longer word it starts ("car" leads with
 * "car phone holder", not "cardigan sweater"); phrases that start with the
 * words beat phrases that only contain them ("phone holder" for "holder"
 * comes after "holder for…"); and of a singular and a plural, or the same
 * words in another order, only the commoner comes back.
 */

export interface Lexicon {
  words: readonly string[];
  phrases: readonly (readonly [string, number])[];
}

export interface Completion {
  /** What to search for. */
  text: string;
  /** How many product names have it. */
  count: number;
  /** The text in parts, the typed ones marked, for drawing the rest in bold. */
  parts: { text: string; typed: boolean }[];
}

export interface Completer {
  complete(input: string, limit?: number): Completion[];
  /** Is this a whole word the catalogue uses (so "car" is finished, "mob" is not)? */
  isWord(word: string): boolean;
}

interface Entry {
  text: string;
  words: string[];
  stems: string[];
  count: number;
  key: string;
}

export function buildCompleter(lexicon: Lexicon, categories?: CategoryIndex): Completer {
  const words = new Set(lexicon.words);
  // The largest category each word is the head noun of. A word being
  // completed into a kind of thing the catalogue has categories for leads
  // one that is only common in product names: "lap" is "laptop" (Laptops)
  // before "lapel", "sho" is "shoes" before "short sleeve", "tab" is
  // "tablet" before "table lamp". Heads only: "Waterproof Cases" says
  // nothing for "waterproof".
  const kindSize = new Map<string, number>();
  for (const c of categories?.all ?? []) for (const s of c.heads) kindSize.set(s, Math.max(kindSize.get(s) ?? 0, c.total));
  const kindLift = (w: string | undefined) => (w ? Math.log10(1 + (kindSize.get(stem(w)) ?? 0)) * 0.5 : 0);
  const entries: Entry[] = lexicon.phrases.map(([text, count]) => {
    const ws = text.split(" ");
    const stems = ws.map(stem);
    return { text, words: ws, stems, count, key: [...stems].sort().join(" ") };
  });
  // Single words as completions too, for one word half typed ("earb" →
  // "earbuds"), counted by how common they are (the list is in that order).
  lexicon.words.forEach((w, rank) => {
    if (w.length < 4) return;
    entries.push({ text: w, words: [w], stems: [stem(w)], count: Math.round(4000 / (rank + 10)), key: stem(w) });
  });

  const isWord = (w: string) => words.has(w) || words.has(stem(w));

  /** Every entry the typed words could be the start of, scored, for one reading of them. */
  function match(typed: string[], open: boolean, into: Map<Entry, { score: number; at: number[] }>) {
    const done = open ? typed.slice(0, -1) : typed;
    const partial = open ? typed[typed.length - 1] : "";
    // A partial that is already a whole word counts as typed whole, but may still grow.
    const partialWhole = !!partial && isWord(partial);
    const doneStems = done.map(stem);
    const typedStems = typed.map(stem).join(" ");
    for (const e of entries) {
      if (e.words.length < typed.length && (open || e.words.length < done.length + 1)) continue;
      // Exactly what is typed, or its plural: nothing to add.
      if (e.stems.join(" ") === typedStems) continue;
      let starts = true;
      for (let i = 0; i < done.length; i++) if (e.words[i] !== done[i] && e.stems[i] !== doneStems[i]) { starts = false; break; }
      let score: number;
      let at: number[];
      if (starts && (!partial || (e.words[done.length] ?? "").startsWith(partial))) {
        if (!partial && e.words.length === done.length) continue;
        score = 4;
        at = Array.from({ length: typed.length }, (_, i) => i);
        if (partial && (e.words[done.length] === partial || e.stems[done.length] === stem(partial))) score += partialWhole ? 3 : 1;
        // Not for a letter or two: "m" says too little to favour anything.
        if (partial.length >= 3) score += kindLift(e.words[done.length]);
      } else {
        // Contains them, in order, somewhere.
        let j = 0;
        const hits: number[] = [];
        for (let i = 0; i < e.words.length && j < typed.length; i++) {
          const want = typed[j];
          const last = j === typed.length - 1 && open;
          if (e.words[i] === want || e.stems[i] === stem(want) || (last && e.words[i].startsWith(want))) {
            hits.push(i);
            j++;
          }
        }
        if (j < typed.length || e.words.length === typed.length) continue;
        // A popular phrase that contains the words can still beat a rare
        // one that starts with them ("phone holder" over "holder storage").
        score = 3.2;
        at = hits;
      }
      score += Math.log10(1 + e.count) * 0.7 - e.words.length * 0.05;
      const had = into.get(e);
      if (!had || had.score < score) into.set(e, { score, at });
    }
  }

  function complete(input: string, limit = 8): Completion[] {
    // Whole words in the catalogue's words ("tws" → "earbuds"); the word
    // still being typed as typed.
    const raw = nameWords(input);
    if (!raw.length) return [];
    // A last word that is a shopper's word for something ("tws") is whole already.
    const aliased = typedWords(raw[raw.length - 1]).join(" ") !== raw[raw.length - 1];
    const open = !/\s$/.test(input) && !aliased;
    const typed = open ? [...typedWords(raw.slice(0, -1).join(" ")), raw[raw.length - 1]] : typedWords(input);
    const found = new Map<Entry, { score: number; at: number[] }>();
    match(typed, open, found);
    // A compound being typed in two words ("smart w" → "smartwatch").
    if (open && typed.length >= 2) {
      const joined = [...typed.slice(0, -2), typed[typed.length - 2] + typed[typed.length - 1]];
      const before = found.size;
      match(joined, true, found);
      if (found.size === before && !found.size) return [];
    }
    const out: Completion[] = [];
    const seen = new Set<string>();
    // Variety in what the half-typed word becomes: no more than `cap` rows
    // for one word ("watch strap", "watch band"…) while another waits
    // ("water bottle"); the word on its own is always welcome, and so is a
    // word already typed whole ("car" is car phone holders, not "care oil").
    // A row held back returns before anything far weaker than it ("mobile
    // phone bag" before "mobius"), or to fill the room left. Everything keeps
    // its rank order.
    const cap = Math.max(2, Math.ceil(limit / 2) - 1);
    const GAP = 1;
    const partial = open ? typed[typed.length - 1] : "";
    const typedWhole = !!partial && isWord(partial) ? stem(partial) : null;
    const perWord = new Map<string, number>();
    const held: { rank: number; score: number }[] = [];
    const chosen: number[] = [];
    let rank = 0;
    for (const [e, { score, at }] of [...found.entries()].sort((a, b) => b[1].score - a[1].score || b[0].count - a[0].count)) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      while (held.length && chosen.length < limit && held[0].score - score > GAP) chosen.push(held.shift()!.rank);
      if (chosen.length >= limit) break;
      rank++;
      const word = open ? e.stems[at[at.length - 1] ?? 0] : "";
      const n = perWord.get(word) ?? 0;
      const hold = open && word !== typedWhole && n >= cap && e.words.length > typed.length;
      if (hold && held.length >= limit) continue;
      out[rank] = { text: e.text, count: e.count, parts: e.words.map((w, i) => ({ text: w, typed: at.includes(i) })) };
      if (hold) {
        held.push({ rank, score });
        continue;
      }
      perWord.set(word, n + 1);
      chosen.push(rank);
      if (chosen.length >= limit) break;
    }
    for (const h of held) if (chosen.length < limit) chosen.push(h.rank);
    return chosen.sort((a, b) => a - b).map((i) => out[i]);
  }

  return { complete, isWord };
}

/**
 * Categories whose names start the way the words typed so far do, word by
 * word ("mob" → "Mobile Phones", "Mobile Phone Accessories"; never
 * "Automobiles"), largest first. For while a word is half typed, when the
 * category resolver has no whole word to go on.
 */
export function categoriesStartingWith(input: string, index: CategoryIndex, limit = 6, isWord?: (w: string) => boolean): CategoryHit[] {
  const typed = nameWords(input);
  if (!typed.length) return [];
  const open = !/\s$/.test(input);
  const find = (prefixLast: boolean) => {
    const out: CategoryHit[] = [];
    for (const c of index.all) {
      if (!c.total) continue;
      const ws = nameWords(c.name);
      // Every typed word is a word of the name, in order; the last may be the start of one.
      let j = 0;
      for (let i = 0; i < ws.length && j < typed.length; i++) {
        const want = typed[j];
        const last = j === typed.length - 1 && prefixLast;
        if (ws[i] === want || stem(ws[i]) === stem(want) || (last && (want.length >= 2 || j > 0) && ws[i].startsWith(want))) j++;
      }
      if (j === typed.length) out.push({ id: c.id, name: c.name, path: c.path, total: c.total, subtree: c.subtree, score: 0 });
    }
    return out.sort((a, b) => b.total - a.total).slice(0, limit);
  };
  // A last word that is already whole ("car") means that word, not every
  // word it starts ("care"): whole words first, the start of one only if
  // they find nothing.
  if (open && isWord?.(typed[typed.length - 1])) {
    const whole = find(false);
    if (whole.length) return whole;
  }
  return find(open);
}
