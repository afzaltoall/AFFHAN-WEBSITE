# DHgate Scraper → S3 → Postgres (Neon)

## Why no login_setup.py this time

DHgate's search and product-detail pages are publicly viewable without
signing in, so there's no login step and no `storage_state.json`.

## Setup

```bash
pip install -r requirements.txt --break-system-packages
playwright install chromium
```

Reuses the same `.env` and `migration.sql` from your other scrapers
(same AWS + Neon values, same `ScrapedProduct` table).

## Run the scraper

```bash
python scrape_dhgate.py "steering wheel cover" --category "automobiles-motorcycles/auto-replacement-parts/automobile-sensors" --pages 1
```

Start with **1 keyword, 1 page** to confirm it works before scaling up.

## Things to know

- **DHgate blocks harder than 1688/Alibaba on IP + request rate.** Delays
  are set higher by default (5-10s). Don't lower them to go faster - that's
  the fastest way to get your IP flagged.
- **If a captcha/verification page appears**, the script stops on purpose
  rather than trying to solve or work around it. Wait a while (hours, not
  minutes) before retrying, and keep volume low.
- **Selectors will break** - DHgate changes markup periodically. If the
  script finds 0 links or 0 images, open the page manually in a browser
  and check whether the CSS selectors in `scrape_dhgate.py` still match.
- **ToS**: DHgate's terms restrict automated data collection, same as most
  marketplaces in this category. This script only touches publicly visible
  pages, doesn't bypass any login or anti-bot protection, and rate-limits
  itself - but running it at real scale or reselling scraped data is a
  legal grey area you should get your own advice on before scaling past
  testing.
- Same `ScrapedProduct` table as your 1688 setup - both sources can coexist,
  deduped by `(source, sourceId)`.
