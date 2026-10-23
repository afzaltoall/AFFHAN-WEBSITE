// New suppliers in an inquiry's matching suppliers (2026-10-23): which of the supplier portal's applications answer an
// inquiry, and in what order (src/lib/server/supplier-match/portal-rank.ts), without a database. The read itself, and
// who may see it, are checked in tests/security/supplier-matches-access.test.mjs.
//   npm run test:supplier-match
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentWordsOf } from "../../src/lib/server/supplier-match/match.ts";
import { SUGGESTED_STATUSES, rankPortalOffers } from "../../src/lib/server/supplier-match/portal-rank.ts";

let made = 0;
/** An application; each one made is a minute newer than the one before. */
const offer = (supplierId, productName, more = {}) => {
  made += 1;
  return { id: `offer-${made}`, supplierId, productId: null, productName, status: "NEW", createdAt: new Date(Date.UTC(2026, 9, 23, 0, made)), ...more };
};
const rank = (inquiry, offers, limit) => rankPortalOffers({ productId: null, ...inquiry }, offers, limit);
const view = (picks) => picks.map((p) => [p.offer.supplierId, p.match, p.shared]);

test("a title's content words: the head before with/for, once each, singular, never who it is for or a size", () => {
  assert.deepEqual(contentWordsOf("Portable Soccer Goal, 12x6 Ft Soccer Net, Folding Goal With Carry Bag"), ["soccer", "goal", "net", "folding"]);
  assert.deepEqual(contentWordsOf("Women's Summer O-neck T-Shirts 3 Pcs"), ["neck", "shirt"]);
  assert.deepEqual(contentWordsOf("Phone Holder for Car"), ["phone", "holder"]);
  assert.deepEqual(contentWordsOf("Decanter"), ["decanter"]);
  assert.deepEqual(contentWordsOf(""), []);
});

test("the inquired product itself: the same catalogue product, whatever the application calls it", () => {
  const picks = rank({ productId: 501, productName: "O-neck T-Shirt" }, [offer("s1", "Cotton tee, any colour", { productId: 501 })]);
  assert.deepEqual(view(picks), [["s1", "product", []]]);
});

test("a supplier's own product with exactly the inquired title is the product too, case and spaces aside", () => {
  assert.deepEqual(view(rank({ productName: "O-neck  T-Shirt " }, [offer("s1", "o-neck t-shirt")])), [["s1", "product", []]]);
  // Two products without a catalogue id are not the same product unless their titles are.
  assert.deepEqual(rank({ productName: "Steel Water Bottle" }, [offer("s2", "Glass Vase")]), []);
  // An empty title is the same as nothing.
  assert.deepEqual(rank({ productName: "" }, [offer("s3", ""), offer("s4", "Decanter")]), []);
});

test("a similar product shares two of the title's content words; the bag a goal comes with shares none", () => {
  const picks = rank({ productId: 7, productName: "Portable Soccer Goal, 12x6 Ft Soccer Net, Folding Goal With Carry Bag" }, [
    offer("s1", "Soccer goal net for training"),
    offer("s2", "Carry Bag"),
    offer("s3", "Basketball net"),
    offer("s4", "Folding soccer goal"),
  ]);
  assert.deepEqual(view(picks), [
    ["s4", "similar", ["folding", "soccer", "goal"]],
    ["s1", "similar", ["soccer", "goal", "net"]],
  ]);
});

test("one word is enough only when either title has just one", () => {
  assert.deepEqual(view(rank({ productName: "Decanter" }, [offer("s1", "Crystal wine decanter"), offer("s2", "Wine glass")])), [
    ["s1", "similar", ["decanter"]],
  ]);
  assert.deepEqual(view(rank({ productName: "O-neck T-Shirt" }, [offer("s3", "T-Shirts"), offer("s4", "Men's Cotton T-Shirt")])), [
    ["s3", "similar", ["shirt"]],
  ]);
});

test("one suggestion a supplier: their best application", () => {
  const picks = rank({ productId: 9, productName: "Silicone Baby Plate Suction" }, [
    offer("s1", "Silicone plate suction bowl"),
    offer("s1", "Baby plate", { productId: 9 }),
    offer("s2", "Silicone suction plate"),
  ]);
  assert.deepEqual(picks.map((p) => [p.offer.supplierId, p.match, p.offer.productName]), [
    ["s1", "product", "Baby plate"],
    ["s2", "similar", "Silicone suction plate"],
  ]);
});

test("order: the product itself, more words shared, accepted then reviewing then new, then the newest", () => {
  const picks = rank({ productId: 3, productName: "Stainless Steel Water Bottle" }, [
    offer("new-3", "Steel water bottle"),
    offer("accepted-2", "Water bottle", { status: "ACCEPTED" }),
    offer("reviewing-2", "Water bottle", { status: "REVIEWING" }),
    offer("new-2-older", "Water bottle"),
    offer("new-2-newer", "Water bottle"),
    // A bottle: its head is one word, so the one it shares is enough, and fewer shared words rank it last.
    offer("new-1", "Bottle for water"),
    offer("the-product", "Any title", { productId: 3 }),
  ]);
  assert.deepEqual(picks.map((p) => p.offer.supplierId), [
    "the-product", "new-3", "accepted-2", "reviewing-2", "new-2-newer", "new-2-older", "new-1",
  ]);
});

test("at most ten, or the limit asked for", () => {
  const offers = Array.from({ length: 15 }, (_, i) => offer(`s${i}`, "Steel water bottle"));
  assert.equal(rank({ productName: "Steel Water Bottle 500ml" }, offers).length, 10);
  assert.equal(rank({ productName: "Steel Water Bottle 500ml" }, offers, 3).length, 3);
});

test("only open and accepted applications are suggested: not selected and withdrawn ones never", () => {
  assert.deepEqual([...SUGGESTED_STATUSES], ["NEW", "REVIEWING", "ACCEPTED"]);
});
