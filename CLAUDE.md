# Affhan Sourcing Marketplace — Project Context

## What this project is

A B2B sourcing marketplace website for **Affhan International Pvt Ltd** — a China-sourcing and freight-forwarding company based in Royapuram, Chennai, with offices in Guangzhou, London, Singapore, Malaysia, and Dubai. In business since 2000.

**Business model: inquiry-only. There is no cart, no checkout, no payments, and no prices shown anywhere in the UI.**

Customers browse a large product catalog, find something similar to what they want, and submit a "Request a Quote" inquiry. Affhan's team then sources it from Chinese suppliers, does QC, and handles shipping/customs. The catalog is essentially a demonstrator of "we can source anything like this" — the listed products are not our inventory and CJ's dollar prices are not our prices, which is why prices must never appear in the UI.

The old corporate site (affhan.com) is being replaced by this. The new site is modelled closely on **Alibaba.com's** layout and browsing UX.

## Tech stack

- **Next.js** (App Router), TypeScript, Tailwind
- **Prisma** ORM
- **Neon** (PostgreSQL) — connection string in `.env.local` as `DATABASE_URL`
- **CJ Dropshipping API** — product data source, key in `.env.local` as `CJ_API_KEY`
- Deployed on **Vercel** (free/Hobby tier — note: only supports **one cron run per day**)
- Local dev on **Windows** (see gotcha below)

## Data pipeline (working — do not break this)

CJ Dropshipping API → daily cron sync → Neon Postgres → our own `/api/products` → frontend.

The frontend **never** calls CJ directly. Product images are **hotlinked** from CJ's CDN (`cf.cjdropshipping.com`, `*.aliyuncs.com`) — we store only the image URL in the DB, never download the files.

### Key files
- `src/lib/cj.ts` — CJ API wrapper, token caching (tokens last ~15 days), rate limiting
- `src/app/api/cron/sync/route.ts` — resumable category-by-category sync
- `src/app/api/products/route.ts` — frontend-facing product API (reads DB only)
- `src/app/api/search/suggestions/route.ts` — search autocomplete
- `scripts/populate_category_thumbnails.mjs` — fills `Category.thumbnailUrl` from product images

### DB models
- `Product` — `cjPid`, `name`, `imageUrl`, `allImages`, `price` (stored but never displayed), `categoryId`, `lastSynced`
- `Category` — CJ category id, `name`, `parentId`, `thumbnailUrl`
- `SyncProgress` — per-category `lastPageFetched`, `totalPages`, `status` (PENDING / IN_PROGRESS / COMPLETED / PARTIAL_LIMIT_REACHED)
- `Inquiry` — customer name, email, phone, companyName, message, quantity, linked to Product

### CJ API constraints (learned the hard way)
- **QPS limit: 1 request/second.** Anything faster returns "Too Many Requests". Current code delays ~1.2–2.5s between calls with retry-on-429.
- **Max offset ~6000 per category.** Large categories (e.g. "Women's Short-Sleeved Shirts", 336 pages) stop at ~6,050 products and get marked `PARTIAL_LIMIT_REACHED`. This is a CJ limitation, not a bug — don't try to "fix" it.
- CJ's category tree is **3 levels deep** (e.g. Phones & Accessories → Mobile Phone Accessories → Cables). **Products are attached only to 3rd-level leaf nodes.** Level 1 and level 2 nodes have zero direct products. Any code that filters categories by product count must aggregate across descendants, or it will hide everything.
- Product names: use `productNameEn` (English), not `productName` (Chinese, and sometimes a JSON-array-shaped string that needs parsing).
- `sellPrice` can be a range string like `"13.60 -- 19.04"` — parse and take the lower bound.

### Current sync state — FINISHED (verified 2026-08-19)
**1,068,225 products** across **509 categories**. Of 634 total categories, 125 hold nothing — those are genuinely empty nodes in CJ's tree, not unfinished work. Every `SyncProgress` row reads `COMPLETED`: nothing is PENDING, IN_PROGRESS, FAILED or PARTIAL_LIMIT_REACHED.

**634 is the entire CJ taxonomy** — the tree is 3 levels deep and that is all of it. The category count cannot grow beyond this from CJ, so treat any figure larger than ~509 in marketing copy as wrong. (A "50,000+ categories" claim was live on the Chennai landing page, the FAQ schema and the site-wide TrustBadges before this was checked.)

Do **not** run `populate_category_thumbnails.mjs` on a hunch — all 509 product-bearing categories already have a `thumbnailUrl`, and none are hidden. The cron sync backfills thumbnails itself as each category completes (see step 5 in `/api/cron/sync/route.ts`), which is what made the standalone script redundant.

EPROLO was added alongside CJ afterwards, so the live totals are larger than the CJ figures above: **1,080,674 products across 699 categories** as of 2026-09-10, of which 12,746 products are EPROLO. Read `Product.supplierSource` before attributing any behaviour to "the sync" — the two feeds differ in what they return (EPROLO has descriptions and variants; CJ has neither).

### Moderation — the part that is not keyword-shaped (2026-09-10)
Adult/18+ removal works on three name-and-category rules in `src/lib/moderation.ts`, and those rules **cannot see the main remaining problem**, which is product photography: close-crops of a model's backside in ordinary activewear, and sheer garments with the body visible. Names and categories for those are innocuous. Image scoring and name heuristics were both tried and both measured as unusable — the reasoning and the numbers are recorded in the long comment in `moderation.ts` and in `tools/audit/skin.mjs`. Don't re-derive them.

Removal of such items is therefore per-product, after someone looks at the picture. `tools/audit/` builds numbered contact sheets for that (`06-build-priority.mjs`), records decisions (`findings.mjs`) and moves them (`90-move-to-log.mjs`, dry-run by default).

**`ModerationLog` is now authoritative, not a log.** `/api/cron/sync` skips any `cjPid` recorded there. Before that check was added the table was write-only and every nightly run re-created anything removed for its photograph. Deleting a row from `ModerationLog` re-admits the product on the next sync.

### Category thumbnails — one script owns this (2026-09-10)
`scripts/assign_category_thumbnails.mjs --apply` assigns every category's picture. The rule: **deterministic** (lowest product id, never newest, so a re-sync does not change the picture), **bottom-up** (leaves claim before parents), and **claim-and-exclude** — an image belongs to exactly one category, so a parent and its child can never show the same photo. It is idempotent: a second run reports 0 changes.

`Category.thumbnailLocked` protects a hand-picked image from the script, and reserves it so nothing else claims it. Set it with `scripts/lock_category_thumbnail.mjs`. Intended for the top-level tiles only.

Two older scripts are marked **SUPERSEDED** and must not be run — `tools/eprolo/16-category-thumbnails.mjs` and `scripts/populate_category_thumbnails.mjs`. They assigned the first image they found with no uniqueness check, which is how 13 images came to be shared by 26 categories and how "Women's Clothing" (89,067 products) ended up displaying the photo of "Suit", a 2-product subcategory.

**36 categories carry `displayAsTopLevel`,** so the top grid renders **53 tiles, not 17**, and 31 of those are promoted children whose parent is also a tile. That is deliberate, not a bug — the tiles now carry an "in <parent>" caption (`promotedParentName` on `CategoryTreeNode`) so the overlap explains itself. No category is ever rendered twice in that grid.

### Tree shape — not what the CJ note above implies
The tree is 3 levels: **17 L1 / 140 L2 / 543 L3**. CJ attaches products only to L3 leaves, but **EPROLO does not**: 10,731 EPROLO products sit on L1 and L2 nodes, and **29 categories hold their own products *and* have children**. Any code that assumes "branch nodes are empty" is wrong for EPROLO.

## What works — don't touch unless asked

- The CJ sync pipeline (auth, rate limiting, resumability)
- The "Request a Quote" modal (Affhan logo, quantity, name, country dropdown, phone code + number, Submit Inquiry) — opens inline on product click, does not navigate away
- Search autocomplete (300ms debounce, queries product/category names, max 8 suggestions)
- Attribute filter chips on search results (derived from a `GROUP BY` on category — **no AI/LLM involved, keep it that way**)

## Known constraints — don't build around these

- **CJ product data has no structured attributes.** No material, colour, size, gender, style, fabric. For CJ's 1,068,225 rows, only category-based filtering and sorting are possible. Don't create filter UI backed by data we don't have.
  - **This is not true of EPROLO.** Every one of its 12,746 rows carries a `description`, and 11,858 of them parse into real attribute pairs — Color (8,545), Size (8,020), Style (6,271), Sleeve Length (6,082), Material (5,717), Fabric (5,525), Neckline, Occasion, Fit Type, Gender — plus a size chart on 8,869. See `src/lib/productDescription.ts`, which reads them. Attribute filters are therefore possible *for EPROLO products only*; any such UI has to cope with the CJ majority having none, so it cannot be a site-wide facet.
- **We have no user tracking**, so Alibaba's "Browsing history" / "Keep looking for" personalised cards can't be replicated — use static equivalents instead.
- Vercel Hobby tier = one cron/day. Frequent syncing during backfill is done via an external scheduler (cron-job.org) hitting `/api/cron/sync`.

## Windows dev gotcha (hit this three times already)

`npx prisma db push` and `npx prisma generate` **fail with `EPERM` if the Next.js dev server is running** — it locks the Prisma engine files. Always stop the dev server (`Ctrl+C`) before running Prisma commands, then restart it after.

Also: after any migration, **verify it actually applied** by querying the new table/column. The CLI has exited cleanly while the schema did not update, more than once.

## Working style I want

- Verify before reporting. Don't say a step succeeded without checking — this project has repeatedly hit "it worked" claims that hadn't.
- If something can't be built with the data we have, say so before building it rather than shipping an empty UI.
- Fix root causes, not symptoms.
- Small, verifiable steps over one big change.

## Current work in progress

Rebuilding the UI to match Alibaba's layout. Full spec is in `affhan-full-ui-spec.md` — read that for the detailed requirements (homepage, mega-menu, navbar, category page with filters, footer).
