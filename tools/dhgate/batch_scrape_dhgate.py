"""
Batch DHgate scraper - runs scrape_dhgate.py's core logic across a list of
keywords/categories from keywords.csv, one after another.

Same safe delays and captcha-stop behavior as scrape_dhgate.py - this just
saves you from typing the command 20 times. Nothing here changes rate,
concurrency, or bypasses any protection.

Usage:
    python batch_scrape_dhgate.py --pages 2

--pages applies to every keyword in keywords.csv (default 2, ~100 products
per keyword => ~2000 products total across 20 keywords).

You can Ctrl+C between keywords if you want to stop early - progress so far
stays in the DB (dedup on source+sourceId means re-running later is safe).
"""

import argparse
import csv
import time
from pathlib import Path

from scrape_dhgate import (
    get_search_urls,
    extract_listing_links,
    scrape_product_detail,
    migrate_images,
    insert_product,
    polite_delay,
    DATABASE_URL,
)
import psycopg2
from playwright.sync_api import sync_playwright


def load_keywords(csv_path: str) -> list[dict]:
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({"keyword": row["keyword"].strip(), "category": row["category"].strip()})
    return rows


def run_keyword(browser, conn, keyword: str, category_path: str, pages: int):
    page = browser.new_page()
    product_links = []
    for search_url in get_search_urls(keyword, pages):
        print(f"  Search page: {search_url}")
        page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        product_links.extend(extract_listing_links(page))
        polite_delay()

    print(f"  Found {len(product_links)} product links for '{keyword}'.")

    inserted = 0
    for i, link in enumerate(product_links, 1):
        print(f"  [{i}/{len(product_links)}] {link}")
        product = scrape_product_detail(page, link)
        if not product:
            continue
        product["category_path"] = category_path
        product = migrate_images(product, category_path)
        if product["migrated_image_urls"]:
            inserted += 1
        insert_product(conn, product)
        polite_delay()

    page.close()
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keywords-file", default="keywords.csv")
    parser.add_argument("--pages", type=int, default=2, help="Pages per keyword (~50 products/page)")
    args = parser.parse_args()

    keywords = load_keywords(args.keywords_file)
    print(f"Loaded {len(keywords)} keywords from {args.keywords_file}\n")

    conn = psycopg2.connect(DATABASE_URL)
    total_inserted = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for idx, row in enumerate(keywords, 1):
            keyword = row["keyword"]
            category = row["category"]
            print(f"\n=== [{idx}/{len(keywords)}] Keyword: '{keyword}' -> {category} ===")
            try:
                count = run_keyword(browser, conn, keyword, category, args.pages)
                total_inserted += count
                print(f"  -> {count} products inserted for '{keyword}'. Running total: {total_inserted}")
            except SystemExit:
                # scrape_product_detail raises SystemExit on captcha/redirect -
                # stop the whole batch rather than hammering the site further.
                print("  ! Stopping batch - captcha/verification triggered.")
                break
            except Exception as e:
                print(f"  ! Unexpected error on '{keyword}': {e} - skipping to next keyword.")
                continue

            # Extra pause between keywords, on top of per-request delays.
            if idx < len(keywords):
                print("  Pausing before next keyword...")
                time.sleep(15)

        browser.close()

    conn.close()
    print(f"\nDone. Total products inserted this run: {total_inserted}")


if __name__ == "__main__":
    main()
