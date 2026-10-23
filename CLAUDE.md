# Affhan Sourcing Marketplace — Project Context

## What this project is

A B2B sourcing marketplace website for **Affhan International Pvt Ltd** — a China-sourcing and freight-forwarding company based in Royapuram, Chennai, with offices in Guangzhou, London, Singapore, Malaysia, and Dubai. In business since 2000.

**Business model: inquiry-only. There is no cart, no checkout, no payments, and no prices shown anywhere in the UI.**

Customers browse a large product catalog, find something similar to what they want, and submit a "Request a Quote" inquiry. Affhan's team then sources it from Chinese suppliers, does QC, and handles shipping/customs. The catalog is essentially a demonstrator of "we can source anything like this" — the listed products are not our inventory and CJ's dollar prices are not our prices, which is why prices must never appear in the UI.

The old corporate site (affhan.com) is being replaced by this. The new site is modelled closely on **Alibaba.com's** layout and browsing UX.

## Tech stack

- **Next.js** (App Router), TypeScript, Tailwind
- **Prisma** ORM
- **Neon** (PostgreSQL) — pooled connection string as `DATABASE_URL`, non-pooled `DIRECT_URL` for migrations
- **Brevo** — transactional email (the password-reset codes): `src/lib/brevo.ts` behind `src/lib/email.ts`
- **Upstash** — rate limits; `src/lib/limit-policy.ts` is the table of them
- Deployed on **Vercel** (Hobby tier — each cron runs **at most once a day**; see "Scheduled jobs")
- Local dev on **Windows** (see gotcha below)

**Removed — don't bring back without asking (2026-10-15):** the CJ Dropshipping API and its sync (the sync stopped 2026-10-09), Amazon SES (replaced by Brevo on 2026-10-14), and Twilio with phone sign-in and its text-message codes. Their env vars (`CJ_API_KEY`, `AWS_SES_*`, `TWILIO_*`, `SMS_PROVIDER`, `OTP_DAILY_CAP`) are read by nothing.

## The catalogue (static — do not break it)

Neon Postgres → our own `/api/products` → frontend. The products were imported from CJ Dropshipping (until 2026-10-09) and from EPROLO; **nothing syncs them now**. The catalogue changes only when someone runs a script, and the daily refresh (below) then picks the change up.

The frontend never calls a supplier. Product images are either **hotlinked** from CJ's CDN (`cf.cjdropshipping.com`, `*.aliyuncs.com`, resized by URL parameter) or stored in our S3 bucket `affan-product-images` and served through CloudFront and the Serverless Image Handler (`src/lib/cdn.ts`). The DB holds only URLs.

### Key files
- `src/app/api/products/route.ts` — frontend-facing product API (reads DB only)
- `src/app/api/search/suggestions/route.ts` — search autocomplete
- `src/app/api/cron/refresh/route.ts` and `src/lib/snapshots.ts` — the daily refresh
- `src/lib/moderation.ts` — what customers never see
- `scripts/assign_category_thumbnails.mjs` — category pictures

### The daily refresh — the homepage and the counts come from here
`/api/cron/refresh/` (Vercel cron at 18:00 UTC, 23:30 IST, under a lock row) recomputes the name flags (`Product.isBlockedName`), the category counts (`Category.productCount`), the homepage's draws for today and tomorrow, and the hero's pool, and stores them as `Snapshot` rows. Requests only read those rows; nothing heavy runs per request. `GET /api/cron/refresh/?force=1` with `CRON_SECRET` runs it at once, e.g. after a catalogue script.

### Scheduled jobs
`vercel.json` runs `/api/cron/leads/rotate` at 05:00 UTC (a daily net) and `/api/cron/refresh/` at 18:00 UTC. cron-job.org calls `/api/cron/leads/rotate` about every 15 minutes with `Authorization: Bearer $CRON_SECRET`. Every cron route refuses a missing secret or one shorter than 32 characters.

### DB models
- `Product` — `cjPid` (the supplier's own id; named for CJ), `supplierSource` (CJ | EPROLO), `name`, `imageUrl`, `allImages`, `price` (stored but never displayed), `categoryId`, `isBlockedName`, `lastSynced` (when it was imported)
- `Category` — CJ category id, `name`, `parentId`, `thumbnailUrl`, `productCount`
- `Snapshot` — the daily refresh's results
- `Inquiry` — customer name, email, phone, companyName, message, quantity, linked to Product
- `MobileUser` — customers, website and app alike; `phone` is a contact number (see "Accounts and sign-in")
- `EmailSuppression` — addresses not to email: Brevo's bounces and complaints, and older rows from SES
- Unused, kept because production has them (dropping one is a migration of its own): `SyncProgress` (the CJ sync's progress) and `MobilePhoneOtp` (phone sign-in's codes)

### About the data (what the CJ import left behind)
- CJ's category tree is **3 levels deep** (e.g. Phones & Accessories → Mobile Phone Accessories → Cables), and CJ attached products **only to 3rd-level leaf nodes**. Any code that filters categories by product count must aggregate across descendants, or it will hide everything. (EPROLO differs — see "Tree shape".)
- CJ's API stopped at an offset of ~6,000 per category, so the largest categories (e.g. "Women's Short-Sleeved Shirts") hold ~6,050 of CJ's products. That was CJ's limit, not a bug.
- For any future import: CJ's English name is `productNameEn` (`productName` is Chinese, sometimes JSON-array-shaped), and `sellPrice` can be a range like `"13.60 -- 19.04"` (take the lower bound).

### Catalogue size
**1,080,674 products across 699 categories** as of 2026-09-10: CJ's 1,068,225 in 509 categories (of CJ's whole 634-category taxonomy, 125 are genuinely empty) plus EPROLO's 12,746. Treat any larger figure in marketing copy as wrong — a "50,000+ categories" claim was live on the Chennai landing page, the FAQ schema and the site-wide TrustBadges before this was checked. `Product.supplierSource` tells the two feeds apart, and they differ (EPROLO has descriptions and variants; CJ has neither).

### Moderation — the part that is not keyword-shaped (2026-09-10)
Adult/18+ removal works on three name-and-category rules in `src/lib/moderation.ts`, and those rules **cannot see the main remaining problem**, which is product photography: close-crops of a model's backside in ordinary activewear, and sheer garments with the body visible. Names and categories for those are innocuous. Image scoring and name heuristics were both tried and both measured as unusable — the reasoning and the numbers are recorded in the long comment in `moderation.ts` and in `tools/audit/skin.mjs`. Don't re-derive them.

Removal of such items is therefore per-product, after someone looks at the picture. `tools/audit/` builds numbered contact sheets for that (`06-build-priority.mjs`), records decisions (`findings.mjs`) and moves them (`90-move-to-log.mjs`, dry-run by default).

**`ModerationLog` is authoritative, not a log.** It records every product removed after review. Nothing re-imports products now, so a removal stays removed; **any future import must skip every `cjPid` recorded there**, as the old nightly sync did (before it learned to, it re-created everything removed for its photograph).

### Category thumbnails — one script owns this (2026-09-10)
`scripts/assign_category_thumbnails.mjs --apply` assigns every category's picture. The rule: **deterministic** (lowest product id, never newest, so a re-sync does not change the picture), **bottom-up** (leaves claim before parents), and **claim-and-exclude** — an image belongs to exactly one category, so a parent and its child can never show the same photo. It is idempotent: a second run reports 0 changes.

`Category.thumbnailLocked` protects a hand-picked image from the script, and reserves it so nothing else claims it. Set it with `scripts/lock_category_thumbnail.mjs`. Intended for the top-level tiles only.

Two older scripts are marked **SUPERSEDED** and must not be run — `tools/eprolo/16-category-thumbnails.mjs` and `scripts/populate_category_thumbnails.mjs`. They assigned the first image they found with no uniqueness check, which is how 13 images came to be shared by 26 categories and how "Women's Clothing" (89,067 products) ended up displaying the photo of "Suit", a 2-product subcategory.

**36 categories carry `displayAsTopLevel`,** so the top grid renders **53 tiles, not 17**, and 31 of those are promoted children whose parent is also a tile. That is deliberate, not a bug — the tiles now carry an "in <parent>" caption (`promotedParentName` on `CategoryTreeNode`) so the overlap explains itself. No category is ever rendered twice in that grid.

### Tree shape — not what the CJ note above implies
The tree is 3 levels: **17 L1 / 140 L2 / 543 L3**. CJ attaches products only to L3 leaves, but **EPROLO does not**: 10,731 EPROLO products sit on L1 and L2 nodes, and **29 categories hold their own products *and* have children**. Any code that assumes "branch nodes are empty" is wrong for EPROLO.

## Accounts and sign-in

- Customers sign in with **email and password** or **Google**, on the website and in the app. There is no phone sign-in and no text-message code.
- **The phone number is a contact number only:** saved as typed, checked by libphonenumber, `phoneVerified` false, never a way in, and at most one account per number (`MobileUser.phone` is unique). After a Google sign-in on an account with none, the website asks for it (`PhonePromptProvider`, prefilled from the quote form when there is one), and the app saves it with `POST /api/mobile/account/phone/`. Account lets customers change it. Limit: 10 saves an hour per account.
- Password reset sends a 6-digit code by email (Brevo).
- Cloudflare Turnstile guards the website's three sign-ins (customer, staff, console), both password resets and the contact form; nothing the app calls asks for it.

## Supplier portal (2026-10-21)

- Suppliers are a **separate phase from customers** (the owner): their own tables (`SupplierAccount`, `SupplierOffer`), their own cookie `affhan_supplier` signed with a key *derived* from AUTH_SECRET (`src/lib/supplier-token.ts`, so it can never pass for an admin, staff or customer session), their own lockout key, reset-code purpose and reset-token audience. The shop's navbar, phone frame and chat bubble hide on `/supplier`.
- `/supplier/login/` and `/supplier/register/` are one card in the customer login's style; an account is **name, email, mobile and password only**. The company, WeChat ID and address are asked with the first application and remembered on the account.
- Signed in: `/supplier/` (the whole catalogue through `/api/products`, with "I have this" on every product, or "apply with your own product"), `/supplier/applications/` (status and the team's reply; withdraw while open), `/supplier/profile/`. An application is the MOQ, the product's details, up to 5 optional photos (presigned uploads under `suppliers/` in the bucket) and the contact details. No price, no lead time.
- Admin: the WeChat book is **"Old Suppliers"** (`/admin/suppliers/`, renamed 2026-10-21 on the owner's request); **"New Suppliers"** (`/admin/new-suppliers/`) is the portal's, in the old book's own layout: one row per registered supplier (company, person, email) with every product they applied for (a status chip each), contact with WhatsApp and copy, address, and an Excel export of suppliers and applications. As in the book, the name opens the supplier's own page, `/admin/new-suppliers/<id>/` (2026-10-23, in Old Suppliers' page layout): every application in full, where the team sets New / Reviewing / Accepted / Not selected, writes the reply the supplier reads, or deletes it; Block / Unblock and Delete supplier. An application's line in the row opens that page at it (`#application-<id>`). The board and the page re-read themselves every 20 s. Rows tick (one, or all shown) for export or **delete for good** (2026-10-22): account, applications, their photos in the bucket (only `suppliers/<uuid>` keys, `supplierPhotoKey`), lockout rows and reset codes.
- Applications also answer customers: an inquiry's "Matching suppliers" lists them first as New suppliers (`src/lib/server/supplier-match/portal.ts`, 2026-10-23): the same product, or a similar one; not selected, withdrawn and blocked never.
- The migration `prisma/migrations/20261021120000_supplier_portal` is **applied on the live database** (2026-10-21 18:20 IST, the owner's go); the code is not deployed yet.

## What works — don't touch unless asked

- Email through Brevo, and the daily refresh
- The "Request a Quote" modal (Affhan logo, quantity, name, country dropdown, phone code + number, Submit Inquiry) — opens inline on product click, does not navigate away
- Search autocomplete (300ms debounce, queries product/category names, max 8 suggestions)
- Attribute filter chips on search results (derived from a `GROUP BY` on category — **no AI/LLM involved, keep it that way**)

## Known constraints — don't build around these

- **CJ product data has no structured attributes.** No material, colour, size, gender, style, fabric. For CJ's 1,068,225 rows, only category-based filtering and sorting are possible. Don't create filter UI backed by data we don't have.
  - **This is not true of EPROLO.** Every one of its 12,746 rows carries a `description`, and 11,858 of them parse into real attribute pairs — Color (8,545), Size (8,020), Style (6,271), Sleeve Length (6,082), Material (5,717), Fabric (5,525), Neckline, Occasion, Fit Type, Gender — plus a size chart on 8,869. See `src/lib/productDescription.ts`, which reads them. Attribute filters are therefore possible *for EPROLO products only*; any such UI has to cope with the CJ majority having none, so it cannot be a site-wide facet.
- **We have no user tracking**, so Alibaba's "Browsing history" / "Keep looking for" personalised cards can't be replicated — use static equivalents instead.
- Vercel Hobby tier = each cron at most once a day. Anything more frequent goes through cron-job.org (see "Scheduled jobs").

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
