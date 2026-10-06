"use client";

import { loadAllCategories } from "@/lib/categoriesClient";
import type { CategoryRecord } from "@/lib/categoryTree";
import { buildCategoryIndex, buildVocabulary, type CategoryIndex, type Vocabulary } from "@/lib/searchIntent";
import { buildCompleter, type Completer, type Lexicon } from "@/lib/searchComplete";

/**
 * The search's engine in the browser (searchIntent, searchComplete): the
 * catalogue's phrases and vocabulary (searchLexicon.json, ~120KB, its own
 * chunk) and the category tree (the same shared fetch the menus use), built
 * into a completer, a typo vocabulary and a category index. Loaded once, the
 * first time a search box is focused, so the page itself never pays for it;
 * from then on every keystroke is answered here, with nothing to wait for.
 */
export interface SearchKit {
  completer: Completer;
  vocab: Vocabulary;
  index: CategoryIndex;
  /** Each category's record (thumbnail, parent) by id. */
  byId: Map<string, CategoryRecord>;
  /** Each category's children with products, largest first. */
  children: Map<string, CategoryRecord[]>;
  /** The largest categories, for an empty search box. */
  popular: CategoryRecord[];
}

let kit: Promise<SearchKit> | null = null;

export function loadSearchKit(): Promise<SearchKit> {
  if (kit) return kit;
  kit = (async () => {
    const [lexiconModule, categories] = await Promise.all([import("@/lib/searchLexicon.json"), loadAllCategories()]);
    const lexicon = ((lexiconModule as { default?: unknown }).default ?? lexiconModule) as unknown as Lexicon;
    const index = buildCategoryIndex(categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, own: c.productCount ?? 0 })));
    const byId = new Map(categories.map((c) => [c.id, c]));
    const total = (id: string) => index.byId.get(id)?.total ?? 0;
    const children = new Map<string, CategoryRecord[]>();
    for (const c of categories) {
      if (!c.parentId || !total(c.id)) continue;
      if (!children.has(c.parentId)) children.set(c.parentId, []);
      children.get(c.parentId)!.push(c);
    }
    for (const list of children.values()) list.sort((a, b) => total(b.id) - total(a.id));
    const popular = categories
      .filter((c) => c.parentId && c.thumbnailUrl && total(c.id) > 0 && (index.byId.get(c.id)?.path.length ?? 0) >= 1)
      .sort((a, b) => total(b.id) - total(a.id))
      .slice(0, 10);
    return { completer: buildCompleter(lexicon, index), vocab: buildVocabulary(lexicon.words, index.words), index, byId, children, popular };
  })().catch((e) => {
    // Not remembered as a failure: the next focus tries again.
    kit = null;
    throw e;
  });
  return kit;
}
