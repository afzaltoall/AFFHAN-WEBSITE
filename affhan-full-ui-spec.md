# Affhan Marketplace — Full UI Build Spec

The current implementation is not working. Please read this whole document before writing any code, and follow it precisely rather than improvising. Where I give example markup, treat the **structure and layout** as the requirement — adapt class names to our existing Tailwind setup, but do not change the layout.

Reference: we are copying Alibaba.com's layout patterns, adapted for our inquiry-only B2B sourcing model (no cart, no checkout, no prices).

---

## BUG 0 — Fix these first (both are currently broken)

### 0.1 Logo is a broken image

The navbar currently renders a broken-image icon followed by the text "AFFHAN." — the logo image is failing to load. Find the `<Image>`/`<img>` in the Navbar, check the `src` path, and fix it. The logo file should be in `/public`. The navbar must show **only the logo image**, no text fallback next to it.

If the logo file doesn't exist in `/public`, tell me — don't substitute text.

### 0.2 Category mega-menu left panel is empty

The mega-menu opens but the left column (where top-level categories should be listed) is completely blank, and the right panel just says "Hover over a category to see its subcategories" forever. Nothing is clickable.

This is almost certainly because the empty-category filter we added is filtering out everything, OR the category fetch is failing. Debug it:
- Log what the `/api/categories` endpoint actually returns
- Check whether the "hide categories with 0 products" logic is accidentally excluding all top-level parents (top-level categories have no products directly attached — only their leaf subcategories do; if you're checking product count on the parent itself, every parent gets hidden)

That last point is my strong suspicion. A top-level category should be shown if **any of its descendants** have products, not based on its own direct product count.

---

## PAGE 1 — Homepage (`app/page.tsx`)

Target layout, top to bottom:

### Section A: Welcome strip (thin bar, full width)

```
┌────────────────────────────────────────────────────────────────┐
│  Welcome to Affhan Sourcing        [Request a Quote] [Our Process] [Contact] │
└────────────────────────────────────────────────────────────────┘
```
- Light grey background, ~60px tall
- Left: "Welcome to Affhan Sourcing" in a medium-weight heading
- Right: 2-3 quick-action links with small icons, separated by thin vertical dividers
- This is directly below the navbar

### Section B: Category rail + feature cards (the main "hero" row)

Two columns, side by side:

**Left column (fixed ~280px wide):**
- A vertical list of top-level categories
- Each row: small icon on the left, category name, chevron `>` on the right
- Compact rows (~48px tall), light hover background
- Scrollable if the list is long, with a visible thin scrollbar
- **Hovering a row opens the mega-menu panel** (see Component 1 below) overlaying the area to the right

**Right column (fills remaining width):**
Alibaba puts "Browsing history" / "Keep looking for" / a promo banner here. We don't have user tracking, so replace with these three cards plus one banner:
1. **"Newly Sourced"** — 1 product image + name (most recently synced product)
2. **"Popular Categories"** — a small 2x2 grid of category thumbnails
3. **"Ready to Ship"** — 1 product image + name
4. **Promo banner (largest, ~40% of the row width)** — teal/brand-coloured gradient card reading "Source anything from China" with a "Browse All Products" button. This mirrors Alibaba's "Hot Picks" banner.

All four sit in a single horizontal row, banner on the far right.

### Section C: Large product grid

- Heading: "Explore the Latest Global Inventory"
- Responsive grid: 6 columns on large desktop, 4 on laptop, 2 on mobile
- Show **48 products** here (not 20 — the current page looks sparse). Pull a diverse mix: sample across different top-level categories rather than 48 from one, so it looks varied like Alibaba's homepage.
- Card contents: image (square, `object-cover`), title (2 lines max, truncate), and an "Inquire" button. **No price.**

### Section D: Corporate trust sections

Keep the existing sections (Sourcing Process, Why Choose Affhan, Global Map, etc.) below the product grid, as we agreed. Condense their vertical padding so the page doesn't feel endless.

### Section E: Footer

See Component 3 below.

---

## PAGE 2 — Category listing page (`/products` and category links)

This is the page a user lands on after clicking a category or subcategory. Model it on Alibaba's category results page.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Home > Automobiles & Motorcycles > Car Electronics       │  ← breadcrumb
├──────────────────────────────────────────────────────────┤
│  Car Electronics  (703 products available)                │  ← heading + count
├───────────┬──────────────────────────────────────────────┤
│  FILTERS  │  [Sort: Newest ▾]                            │
│           │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ Categories│  │      │ │      │ │      │ │      │        │
│  □ Sub A  │  │ img  │ │ img  │ │ img  │ │ img  │        │
│  □ Sub B  │  └──────┘ └──────┘ └──────┘ └──────┘        │
│  □ Sub C  │   Title    Title    Title    Title           │
│           │  [Inquire][Inquire][Inquire][Inquire]        │
│           │                                              │
│           │              [ Load More ]                   │
└───────────┴──────────────────────────────────────────────┘
```

### Breadcrumb (new — we don't have this yet)
`Home > [Top-level category] > [Subcategory]`, each segment clickable. Sits above the page heading.

### Page heading
Category name in large type, with the product count next to it in muted grey: `Car Electronics (703 products available)`.

### Left filter sidebar (~240px)

**Important — read this before building filters:**

Alibaba shows filters like Material, Gender, Style, Colour, Size, Fabric Type. **We cannot replicate those.** Our CJ product data does not contain structured attributes — we only have product name, image, category, and price. Do **not** create filter sections for attributes we don't have data for; they would render empty or return zero results and look broken.

Build only these, which we can actually back with real data:
1. **"Categories"** — list of sibling/child subcategories within the current category, each with its product count, as clickable filters (checkbox or link style). This is the primary filter and matches Alibaba's top "Categories" filter block.
2. **"Sort by"** — Newest First / A-Z. (Keep at the top of the results area rather than the sidebar if that reads better.)

If you think there's another filter we can genuinely derive from existing DB columns, propose it to me first — don't invent one.

### Results grid
Same card style as everywhere else: image, 2-line title, Inquire button. No price. Keep the existing Load More pagination.

---

## COMPONENT 1 — Category mega-menu

Triggered by: hovering "All Categories" in the navbar, and by hovering a row in the homepage category rail. 200ms open delay, short close grace period (already specified previously).

### Layout (matches Alibaba exactly)

```
┌────────────────┬────────────────────────────────────────────┐
│ Apparel        │  Apparel & Accessories                     │
│ Home & Garden  │                                            │
│ Electronics ◄──│   ◯      ◯      ◯      ◯      ◯      ◯   │
│ Jewelry        │  Name   Name   Name   Name   Name   Name   │
│ Sports         │                                            │
│ Vehicles       │   ◯      ◯      ◯      ◯      ◯     [→]   │
│ ...            │  Name   Name   Name   Name   Name  View All│
└────────────────┴────────────────────────────────────────────┘
```

- **Left rail (~280px):** top-level categories, one per row, icon + name. Active/hovered row gets a light background and a coloured left border.
- **Right panel:** grid of that category's subcategories, **7 per row**. Each tile = circular thumbnail (~90px diameter, `object-cover`, light grey circle background) with the subcategory name centred beneath it in small text (2 lines max).
- Last tile in the grid = **"View All"** — a circular tile with a `→` arrow icon, linking to the full category page.
- Panel is wide (near full content width), white background, subtle shadow, rounded corners.

### Rules
- Only render subcategories that have products (already implemented — but verify it isn't hiding everything, see BUG 0.2)
- Never render a grey "No Img" placeholder. If a subcategory somehow lacks a thumbnail, omit that tile.
- Clicking any subcategory tile navigates to Page 2 filtered to that subcategory.

---

## COMPONENT 2 — Navbar

```
┌──────────────────────────────────────────────────────────────────────┐
│ [LOGO]  [☰ All Categories | search input........... 🔍] ABOUT CONTACT │
└──────────────────────────────────────────────────────────────────────┘
```
- Logo far left (image only — see BUG 0.1)
- Search bar centred, wide (should take up roughly half the header width), with the "All Categories" trigger attached to its left edge as a single combined control, and the search icon button on the right edge
- Placeholder text: "What are you sourcing today?"
- Autocomplete dropdown (already built) hangs below the input
- Right side: minimal links only — About, Contact Us
- Sticky to the top of the viewport on scroll
- Present on **every** page

---

## COMPONENT 3 — Footer

Model on Alibaba's footer (see reference): a wide, multi-column link footer, not a thin bar.

Columns:
1. **About Affhan** — Why Choose Affhan, Our Process, About Us, Contact
2. **Sourcing Services** — Product Sourcing, Quality Control, Private Label & Packaging, Freight Forwarding, Customs Clearance
3. **Support** — Request a Quote, FAQ, Track an Inquiry
4. **Affhan International Pvt Ltd** — full address (No.69/46, Appavoo Tower, West Madha Church Road, Near Harbour Gate No: 3, Royapuram, Chennai – 600 013, Tamil Nadu, India), phone 044-4743 2777, email info@affhan.com

Below the columns: a thin bar with the copyright line on the left and social icons (Instagram, YouTube, LinkedIn, Facebook) on the right.

Do **not** include payment method logos (Visa/Mastercard/PayPal etc. as Alibaba does) — we don't take payments.

The footer must appear on every page, full width, with no sidebar overlapping it (we hit that bug before — the sidebar must be inside the content flex container, the footer outside it).

---

## Build order

Please work in this order and show me a screenshot after each step:

1. BUG 0.1 (logo) and BUG 0.2 (empty mega-menu) — nothing else matters until these work
2. COMPONENT 1 (mega-menu) fully styled per spec
3. COMPONENT 2 (navbar)
4. PAGE 1 (homepage) sections A–C
5. COMPONENT 3 (footer), applied site-wide
6. PAGE 2 (category page with breadcrumb + filter sidebar)

## Ground rules

- Do not report a step as done without a screenshot showing it working. If the browser screenshot tool is unavailable, say so explicitly and tell me what to check manually — don't say "it works now."
- If something in this spec can't be built with our existing data, say so before building it rather than shipping something empty.
- Don't touch the CJ sync pipeline, the Request a Quote modal, or the search autocomplete — those work.
