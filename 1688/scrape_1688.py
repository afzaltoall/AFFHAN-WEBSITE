"""
1688 product scraper -> S3 image migration -> Postgres insert.

Reuses the storage_state.json session created by login_setup.py.

Usage:
    python scrape_1688.py "steering wheel cover" --pages 2

Notes / limits (read before running):
- This only scrapes what's visible to a logged-in normal user. It does not
  attempt to bypass captchas, IP blocks, or any other anti-bot protection.
  If 1688 shows a captcha mid-run, the script stops — solve it manually in
  a real browser (re-run login_setup.py) rather than automating around it.
- Respect 1688's Terms of Service. Keep volume reasonable and delays on.
- Selectors below are best-effort based on 1688's typical DOM structure —
  the site changes markup often, so expect to adjust CSS selectors over time.
"""

import argparse
import io
import os
import random
import time
import uuid
from urllib.parse import quote

import boto3
import psycopg2
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from PIL import Image
import requests

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
S3_BUCKET = os.environ["S3_BUCKET"]
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "").rstrip("/")
MIN_DELAY = float(os.environ.get("MIN_DELAY_SECONDS", 3))
MAX_DELAY = float(os.environ.get("MAX_DELAY_SECONDS", 7))
STORAGE_STATE_PATH = "storage_state.json"

s3 = boto3.client("s3", region_name=AWS_REGION)


def polite_delay():
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


def get_search_urls(keyword: str, pages: int) -> list[str]:
    base = f"https://s.1688.com/selloffer/offer_search.htm?keywords={quote(keyword)}"
    return [f"{base}&beginPage={i}" for i in range(1, pages + 1)]


def extract_listing_links(page) -> list[str]:
    """Grab product detail links from a search results page."""
    page.wait_for_selector("a[href*='detail.1688.com']", timeout=15000)
    hrefs = page.eval_on_selector_all(
        "a[href*='detail.1688.com']",
        "els => els.map(e => e.href)",
    )
    # dedupe, keep order
    seen = set()
    unique = []
    for h in hrefs:
        if h not in seen:
            seen.add(h)
            unique.append(h)
    return unique


def scrape_product_detail(page, url: str) -> dict | None:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  ! failed to load {url}: {e}")
        return None

    if "login.1688.com" in page.url:
        print("  ! redirected to login — session expired, re-run login_setup.py")
        raise SystemExit(1)

    title = page.locator("h1").first.inner_text(timeout=8000) if page.locator("h1").count() else "Untitled"

    # Main + gallery images
    image_urls = page.eval_on_selector_all(
        "img[src*='alicdn.com']",
        "els => els.map(e => e.src).filter(s => s.includes('.jpg') || s.includes('.png') || s.includes('.jpeg'))",
    )
    image_urls = list(dict.fromkeys(image_urls))  # dedupe, keep order

    # crude SKU/offer-id from URL, e.g. .../123456789.html
    offer_id = url.rstrip("/").split("/")[-1].replace(".html", "")

    return {
        "source": "1688",
        "source_id": offer_id,
        "name": title.strip(),
        "sku": offer_id,
        "source_url": url,
        "image_urls": image_urls[:10],  # cap to avoid pulling 50 tiny thumbnails
    }


def download_image(url: str) -> bytes | None:
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        # sanity check it's a real image, not an HTML error page
        Image.open(io.BytesIO(resp.content)).verify()
        return resp.content
    except Exception as e:
        print(f"    ! image download failed ({url}): {e}")
        return None


def upload_to_s3(image_bytes: bytes, key: str) -> str:
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=image_bytes, ContentType="image/jpeg")
    if CLOUDFRONT_DOMAIN:
        return f"{CLOUDFRONT_DOMAIN}/{key}"
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"


def migrate_images(product: dict) -> dict:
    urls = []
    for idx, img_url in enumerate(product["image_urls"]):
        raw = download_image(img_url)
        if not raw:
            continue
        key = f"products/1688/{product['source_id']}/{idx}-{uuid.uuid4().hex[:8]}.jpg"
        s3_url = upload_to_s3(raw, key)
        urls.append(s3_url)
    product["migrated_image_urls"] = urls
    return product


def insert_product(conn, product: dict):
    if not product["migrated_image_urls"]:
        print("  ! no images migrated, skipping DB insert")
        return
    main_image = product["migrated_image_urls"][0]
    all_images = product["migrated_image_urls"]

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "ScrapedProduct"
                (source, "sourceId", name, sku, "sourceUrl", "imageUrl", "allImages")
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (source, "sourceId") DO NOTHING
            """,
            (
                product["source"],
                product["source_id"],
                product["name"],
                product["sku"],
                product["source_url"],
                main_image,
                psycopg2_json(all_images),
            ),
        )
    conn.commit()


def psycopg2_json(value):
    import json
    return json.dumps(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("keyword", help="Search keyword, e.g. 'steering wheel cover'")
    parser.add_argument("--pages", type=int, default=int(os.environ.get("MAX_PAGES_PER_KEYWORD", 2)))
    args = parser.parse_args()

    if not os.path.exists(STORAGE_STATE_PATH):
        print("No saved session found. Run `python login_setup.py` first.")
        raise SystemExit(1)

    conn = psycopg2.connect(DATABASE_URL)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE_PATH)
        page = context.new_page()

        product_links = []
        for search_url in get_search_urls(args.keyword, args.pages):
            print(f"Search page: {search_url}")
            page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            product_links.extend(extract_listing_links(page))
            polite_delay()

        print(f"Found {len(product_links)} product links.\n")

        for i, link in enumerate(product_links, 1):
            print(f"[{i}/{len(product_links)}] {link}")
            product = scrape_product_detail(page, link)
            if not product:
                continue
            product = migrate_images(product)
            insert_product(conn, product)
            polite_delay()

        browser.close()

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
