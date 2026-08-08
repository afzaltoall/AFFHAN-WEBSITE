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

### Current sync state
~200,000–270,000 products synced across ~270 categories. Of 634 total categories, ~364 still have zero products (sync incomplete, plus CJ has empty categories in its tree). Those 364 have no `thumbnailUrl` and are currently hidden from the UI. **When the sync finishes, re-run `populate_category_thumbnails.mjs` so they appear.**

## What works — don't touch unless asked

- The CJ sync pipeline (auth, rate limiting, resumability)
- The "Request a Quote" modal (Affhan logo, quantity, name, country dropdown, phone code + number, Submit Inquiry) — opens inline on product click, does not navigate away
- Search autocomplete (300ms debounce, queries product/category names, max 8 suggestions)
- Attribute filter chips on search results (derived from a `GROUP BY` on category — **no AI/LLM involved, keep it that way**)

## Known constraints — don't build around these

- **CJ product data has no structured attributes.** No material, colour, size, gender, style, fabric. Alibaba-style attribute filters cannot be replicated. Only category-based filtering and sorting are possible. Don't create filter UI backed by data we don't have.
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

Open bugs at time of writing:
1. Navbar logo renders as a broken image — path mismatch, `/affhan-logo.png` vs the actual file in `/public`
2. Category mega-menu left panel renders empty — caused by the 3-level tree issue described above
