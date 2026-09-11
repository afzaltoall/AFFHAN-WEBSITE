# Catalogue moderation audit — 2026-09-10

Prompted by two reports of 18+ items visible on the site: one in
**Fashion & Clothing → Suits & Sets**, one in **Sportswear → Pants**.

## The finding that shapes everything else

Both reported items have completely innocuous names and sit in ordinary
categories:

| id | name | what the picture shows |
|----|------|------------------------|
| 1210233 | Slim fit navel strap contrasting striped suit for women | midriff-baring two-piece |
| 620545  | High Waist Leopard-print Shorts Fitness Yoga Shorts | close-crop of a model's backside filling the frame |

`src/lib/moderation.ts` can read a product's **name** and its **category**.
Neither says anything here. The problem is the **photograph**, and no rule in
that file can reach it.

Three ways to automate it were tried and all three failed on measurement:

1. **Skin-tone image scoring.** Ranked 620605 — one of the clearest examples in
   the catalogue — **923rd of 974** in its own category, scoring `centre=0.000`.
   Opaque leggings fill the frame; there is no exposed skin to detect. The same
   scorer rated a plain beige jumper (0.590) above a sheer mesh bodysuit with
   the body visible (0.232). Full write-up in `skin.mjs`. A 512,398-image scan
   was started and abandoned once this was proven.
2. **Name terms** for the same cluster (`hip lift`, `hip-showing`, `buttock`,
   `peach hip`, `booty`). Present in only **11 of 38** confirmed cases (29%),
   while matching ~600 unverified products catalogue-wide.
3. **Blocking the categories.** "Pants" holds 974 products, mostly ordinary
   trousers and joggers.

So these items are removed **individually, by id, after someone looks at the
picture**. That is slow and it is the only accurate method available.

## What was actually removed — 297 products

| tier | count | basis |
|------|-------|-------|
| `adult-category:Sex Product` | 165 | EPROLO's own adult category, under two parents |
| `adult-name:*` | 67 | sexy underwear, lingerie, delay spray, chastity hardware, exotic condom |
| `adult-imagery` / `adult-device` / `adult-party-game` | 5 | individually decided |
| `visual-review:body-crop-closeup` | 38 | backside/crotch close-crops, seen by eye |
| `visual-review:sheer-body-visible` | 15 | sheer fabric, body or underwear visible |
| `visual-review:adult-lingerie-swimwear` | 8 | bodystocking, thong shapewear, bikinis |
| `visual-review:underwear-product` | 1 | thong, sold as underwear |

Catalogue: 1,080,971 → **1,080,674**. All 297 are in `ModerationLog` with a
reason, and none remain in `Product` (verified by query, not by assumption).

### Terms deliberately NOT blocked

Checked against the live catalogue first. Each would have deleted legitimate
stock:

| term | hits | what they actually are |
|------|------|------------------------|
| `prostate` | 77 | health supplements |
| `handcuff` | 57 | bracelets and pendants |
| `naughty` | 52 | cat shower curtains, children's nail stickers |
| `pole dance` | 37 | high-heeled boots |
| `kinky` | 32 | hair texture — "kinky curly wig" |
| `thong` | 184 | 92 of them sandals |
| `peephole` | 17 | door-viewer cameras |
| `vagina` | 14 | feminine-health supplements, medical devices |

## Coverage — INCOMPLETE, and here is exactly where it stops

96 review sheets were built for the browsable fashion catalogue (6,048
products). **19 were reviewed before the session's image budget was exhausted.**

| category | products | sheets | reviewed |
|----------|----------|--------|----------|
| Suits & Sets | 539 | 9 | **9 — complete** |
| Pants (CJ) | 974 | 16 | **6 of 16** (ids 620515–620909) |
| Unisex Dresses | 1,776 | 28 | 0 |
| Jackets & Coats | 1,176 | 19 | 0 |
| Unisex Hoodies | 675 | 11 | 0 |
| Unisex Jeans | 440 | 7 | 0 |
| Unisex Accessories | 175 | 3 | 0 |
| Others | 107 | 2 | 0 |
| Socks & Leggings | 14 | 1 | 0 |

Hit rate where reviewed: **7.8%** of Suits & Sets, **~11%** of the Pants
reviewed. On that basis the ~4,500 unreviewed products in this set plausibly
hold **300–500 more** — and *Sports Accessories* (19,995 products, a junk
drawer holding everything from body chains to baby sunglasses) was never
sheeted at all.

**Do not read this audit as "the catalogue is now clean."** It is cleaner, in
two named categories, by a method that works.

### Resuming

```bash
node tools/audit/06-build-priority.mjs            # sheets (already built)
# look at tools/audit/out/sheets/<tag>/s0NN.jpg — tiles are labelled with the
# PRODUCT ID, so a finding never drifts when the catalogue changes
node tools/audit/findings.mjs <reason> <id> <id>  # record
node tools/audit/90-move-to-log.mjs <decisions.json>          # dry run
node tools/audit/90-move-to-log.mjs <decisions.json> --apply  # move
```

## 48 products held for a human decision

`out/review-queue.json`. Revealing but arguably ordinary fashion or activewear —
deep-V jumpsuits, bralette-and-pants sets, sports-bra shots, men's compression
shorts. Judgement call about what a B2B sourcing catalogue should show, not a
clear 18+ line. Nothing was moved on my own judgement here.

## Bugs found and fixed along the way

**Every moderated product was still readable at its own URL.** `/products/<id>/`
was a bare `findUnique` with no moderation of any kind, so everything the grid
hid was served in full — including the three ids in `BLOCKED_PRODUCT_IDS`, which
exist precisely because someone had already found them. Fixed in the page, and
in `layout.tsx` where the HTTP status can still change (a 404 raised inside the
page's Suspense boundary is a soft 404).

**`/api/products/[id]` had no moderation and leaked `sku`.** Every SKU here is
the supplier's own code; publishing one identifies the supplier and lets anyone
look the item up at its source price. The PDP refuses to render it for that
reason. Now 404s moderated products and selects its fields explicitly.

**"Similar products" was unfiltered** — a category query with no moderation
clause, able to show a blocked item beside an innocuous one.

**`/api/rankings`** tested only a leaf's own name, not its ancestors, so a leaf
named "Boxers" under blocked "Underwear & Loungewear" passed; and its product
query applied neither the name regex nor the blocked-id list.

**All 12,742 EPROLO product pages rendered raw HTML as visible text**
(`<p><table style="border-collapse...`), and the same string was sliced into
every `meta description` and OpenGraph card. The comment that made this look
safe said the description column was empty for all 1,068,225 rows — true of CJ,
and CJ is 1,068,225 of 1,080,971. Now parsed by `src/lib/productDescription.ts`
into specs and a size chart: 11,858 products yield attributes (avg 9.3), 8,869
yield a size chart, 0 leak markup.

**`ModerationLog` was write-only, so this audit would have undone itself.** The
cron sync never consulted it. Since these items pass every name and category
check, the next nightly run would have re-created all 297. `/api/cron/sync` now
skips any `cjPid` in the table — which makes it authoritative rather than a log.
*Deleting a row from it re-admits that product.*

**`tools/eprolo/moderation.mjs` had drifted from the rules it mirrored** — no
`BLOCKED_PRODUCT_IDS` at all — so `23-moderation-gate.mjs`, whose job is to
prove nothing leaks, was checking against rules the site does not use. It is now
a re-export; `tools/audit/rules.mjs` reads the TypeScript source directly.

## Also worth knowing

**EPROLO products have structured attributes.** CLAUDE.md said Alibaba-style
attribute filters were impossible. That is true for CJ, and only CJ. All 12,746
EPROLO rows carry Color (8,545), Size (8,020), Style (6,271), Sleeve Length
(6,082), Material (5,717), Fabric, Neckline, Occasion, Fit Type, Gender. Real
filters are possible for that slice — though not as a site-wide facet, since the
CJ majority has none. CLAUDE.md corrected.

**Categorisation is visibly wrong in places**, which the reports touched on but
this audit did not fix: Halloween costumes, Christmas family pyjamas and cosplay
are filed under *Suits & Sets*; sleepwear and robes sit there too; *Sports
Accessories* holds 19,995 items including body chains, fruit drinks and baby
sunglasses. Worth its own pass.

## Verified, not assumed

- moderated product page → **404**; live product page → **200**
- moderated product API → **404**; live API → **200**, no `sku`, `AFF-` reference
- PDP HTML contains parsed spec labels and **zero** escaped supplier tags
- 0 products remain in any adult category
- `tsc --noEmit` clean, `eslint` clean on all changed files
- `tools/eprolo/23-moderation-gate.mjs` → **PASS**

One correction worth recording: six findings recorded early were **wrong** and
were discarded. Sheets were labelled by position, and moving 235 products
shortened a category by 8, so every index in an already-reviewed sheet pointed
at its neighbour. Tiles carry the product id now.

---

# Session 2 — 2026-09-10 (later)

Follow-up: "Suits & Sets has wrong products and images, even some exotic 18+";
"there is an empty space, fill it"; and a question about EPROLO vs CJ listings.

**I could not see any of the attached screenshots** — every one exceeded the
2000px limit and was rejected before reaching me. Everything below was done from
the database and from names, not from the marked images.

## The 18+ items still in Suits & Sets were ones I had held back

Session 1 flagged 48 products as `revealing-borderline` and deliberately did not
move them, on the grounds that they were arguably ordinary fashion. 19 of those
were in Suits & Sets. That judgement was wrong for this catalogue, and being
told twice is enough — all 48 have been moved.

A stricter name pass on what remained found 9 more, now moved:

| id | why |
|----|-----|
| 1210252 | "Sexy slim fit sleeveless elastic color **thong** set" — `thong` is excluded from the global keyword list because 92 matches are sandals; in a clothing set it is underwear |
| 1209084 | "Strapless Bodycon Sexy Deep Backless Export **Bodysuit** Pants" |
| 1210984 | "Black Hollow Long Sleeve **Bodysuit** ... **Inner Wear** Slim Sexy" |
| 1211887 | "Round neck long sleeved mesh **transparent** jumpsuit" |
| 1210234 | "**Bare back and navel** mesh hanging neck skirt set" |
| 1211514 | "**backless lace up navel** hanging neck camisole vest" |
| 1208269 | "Sexy **Open Front Sleepwear** Set" |
| 1211115 | "Lolita **Maid Costume Sexy Cosplay**" |
| 1211120 | "Caribbean Pirate Halloween **Sexy** Men's **Role Play**" |

**Session total moved: 354 products.** Catalogue 1,080,971 → **1,080,617**.

## "Wrong products" — 72 things in Suits & Sets that were not sets

| moved to | count | examples |
|----------|-------|----------|
| **Costumes & Cosplay** (new category) | 59 | Demon Slayer, Silent Hill nurse, Wizard of Oz, Chucky, Superman cape, Genshin Impact |
| Unisex Dresses | 10 | single dresses with no second piece |
| Jackets & Coats | 3 | a washed denim jacket, two blazers |

Nothing was deleted — only `categoryId` changed. Suits & Sets is now **416
genuine two-piece sets**, down from 547 when this started.

A listing only counts as a set if its own name says so ("… Set", "Two-Piece",
"Top + Pants"). That test is what stops "Women's **Dress Set** with Bodycon Slit
Skirt" being moved to Dresses on the word "dress". One product, 1212718
("Blazer Jacket **and** Chiffon Long Pants"), is pinned in place by id because
it reads as a single jacket but is two pieces.

`Costumes & Cosplay` (`EPROLO-L2-COSTUMES`) is a genuinely new node — EPROLO's
taxonomy has no costume category, and the only costume-ish category anywhere in
the tree was "Cosplay Wigs" under Synthetic Hair.

## Empty space — fixed one real cause, could not see the marked one

Every product-bearing category now has a thumbnail. **Socks & Leggings** had
none (14 products), which renders as a blank tile in any category grid. It was
the only one in the whole tree; now 0.

Whether that is the gap that was marked, I cannot say — the screenshot did not
reach me. The product gallery was checked and is *not* a cause: it is guarded by
`gallery.length > 1`, so it collapses rather than leaving a hole.

## Why EPROLO listings show several products and CJ ones do not

Not a bug — the two feeds return different things:

| | CJ (1,068,137) | EPROLO (12,537) |
|---|---|---|
| Variants (colour/size) | **0** | 133,263 — avg 10.6 each; 126,423 have a 2nd option |
| Gallery images | **0** — `allImages` is `[]` or null on every row | avg 7.8, max 132 |
| Description | 0 | all of them |

EPROLO returns a `variantlist` per product (colour, size, SKU, stock, and a
per-variant image). CJ's list endpoint returns a name and one image. A CJ
product cannot show options because that data has never existed for it.

## Cache note

`/api/categories` is an `unstable_cache` with `revalidate: 3600`, so the tree —
category names and product counts — can lag a database change by up to an hour.
`POST /api/revalidate?tags=categories,products` forces it, but requires
`CRON_SECRET`, which is **not set in local `.env`/`.env.local`** (it returns 503
and fails closed, which is correct). Set it locally, or restart the dev server,
to see category changes immediately. `/api/products` is not affected and showed
the new category's 59 products straight away.

## Still outstanding

- **77 of 96 review sheets remain unreviewed** (Unisex Dresses 28, Pants 10 of
  16, Jackets 19, Hoodies 11, Jeans 7, Accessories 3, Others 2, Socks 1), and
  *Sports Accessories* (19,995 products) was never sheeted. This session added
  no visual coverage — images could not be read at all.
- Sleepwear (35 products) is still in Suits & Sets. Two-piece pyjama sets are
  defensibly sets, and EPROLO has no sleepwear category; splitting them out is a
  judgement call, not a fix.

---

# Session 3 — 2026-09-11

Asked to resume the by-eye sheet review from Pants sheet 7.

## The by-eye review did not happen — images cannot be read in that session

Tested before starting, and again at three sizes. A sheet at its native
1600x1776 was refused; downscaled to 1400x1554, refused; downscaled to
**760x844 — both dimensions far under any stated limit — also refused.**

The refusal message names a 2000px dimension cap, which is misleading: the cap
is not what is being hit. Image reading was simply unavailable for the whole
session. No sheet from s006 onward was looked at, and nothing below was found by
eye. **The 77 unreviewed sheets remain unreviewed.**

## What was done instead: names, not pictures

Name-based analysis, which has repeatedly found real problems in this catalogue
(the Fine Jewelry body chain, the ten mismatched thumbnails, the 590 children's
intimate-apparel products). **460 products moved.**

| Where | Moved | Basis |
|-------|-------|-------|
| Pants (sheets 7-16, unreviewed half) | 10 | the garment's own name says see-through / transparent / sheer |
| Unisex Dresses, Hoodies, Others, Jackets | 17 | same, plus two "Bikini Cover-Up" and one "Erotic" |
| **Sports Accessories** | **433** | intimate apparel filed in a sports junk drawer |

Two of the Pants removals — 1213717 and 1213724 — are items from the original
report screenshots, sitting in the half that had never been reviewed.

## Sports Accessories: yes, prioritise it. It was the worst thing found.

19,995 products, never sheeted, and it is not a sports category at all in
places. It held **433 intimate-apparel listings** — men's and women's underwear,
thongs, panties, nipple covers — of which **39 were children's**
("Children's Underwear Cotton Boys Boxer Briefs", "Boy Girls' Thermal Underwear
Suit", "Cute Girl's Underwear Two Piece Set").

**The existing keyword rules caught exactly zero of them.** `isNameBlocked`
matched none of the 442 candidates: the list blocks "thong panties" and
"nipple cover" as full phrases, and these products say "panties", "boxer briefs"
and "nipple stick".

It is now 19,562 products with 7 intimate-apparel names left, all deliberately
kept: drawer dividers, storage boxes, and baby teethers that match "nipple".

## Four substring traps caught before applying

Every one would have removed legitimate stock, and none is obvious:

| Trap | What it matched |
|------|-----------------|
| `sheer` | **"Ed SHEERan** Mathematics Tour Hooded Sweatshirt" — twice |
| `box` | **"box**er briefs" — wrongly excluded 82 real underwear items from removal |
| `see-through` | "Running Shorts with **Anti-**See-Through Feature" — the opposite property |
| `boxing`/`punch` | "Modal **Boxing** Underpants", "Seamless Panties 3D **Punching**" — both genuinely underwear |

The `box`/`boxer` one ran in the wrong direction: it would have *left* 82
underwear products live. The others would have deleted a tour hoodie and a pair
of anti-see-through running shorts.

## Deliberately NOT moved

66 products matched a sheer/mesh pattern; only 17 were moved. **"Sheer" is
ordinary in womenswear** — sheer sleeves, a mesh overlay on a ball gown, a tulle
skirt, a lace sun-protection cover-up. Moving all 66 would have repeated the
mistake this report warns about twice already. The 49 left need eyes, not
another regex.

## State

Products 1,080,027 -> **1,079,567**. ModerationLog 67,172 -> **67,632**.
`tsc` clean; moderation gate **PASS**.
