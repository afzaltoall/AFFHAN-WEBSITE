"""
DHgate product scraper -> S3 image migration -> Postgres insert.

Unlike 1688/Alibaba, DHgate product search + detail pages are publicly
viewable without login, so no storage_state.json / login_setup.py needed.

Usage:
    python scrape_dhgate.py "steering wheel cover" --category "automobiles-motorcycles/auto-replacement-parts/automobile-sensors" --pages 1

Notes / limits (read before running):
- This only scrapes publicly visible pages. It does not attempt to bypass
  captchas, IP blocks, or any other anti-bot protection. If DHgate shows a
  captcha or blocks the request mid-run, the script stops.
- Respect DHgate's Terms of Service. Keep volume low and delays on -
  DHgate rate-limits/IP-blocks harder than most sites in this category.
- Selectors below are best-effort based on DHgate's typical DOM structure -
  the site changes markup often, so expect to adjust CSS selectors over time.
  Run once with a single keyword/page first and check the output before
  scaling up.
"""

import argparse
import io
import os
import random
import time
from pathlib import Path
from urllib.parse import quote, urlparse, urlunparse, parse_qsl, urlencode

import boto3
import psycopg2
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from PIL import Image
import requests

load_dotenv()

_root_env = Path(__file__).resolve().parent.parent / ".env"
if _root_env.exists():
    load_dotenv(dotenv_path=_root_env, override=False)


def sanitize_postgres_dsn(raw_url: str) -> str:
    """
    Prisma-style DATABASE_URLs often carry query params (pool_timeout,
    connection_limit, schema, etc.) that psycopg2 doesn't understand.
    Keep only params psycopg2/libpq actually recognizes.
    """
    allowed = {
        "sslmode", "sslcert", "sslkey", "sslrootcert", "connect_timeout",
        "application_name", "options", "target_session_attrs",
    }
    parsed = urlparse(raw_url)
    kept = [(k, v) for k, v in parse_qsl(parsed.query) if k in allowed]
    new_query = urlencode(kept)
    return urlunparse(parsed._replace(query=new_query))


DATABASE_URL = sanitize_postgres_dsn(os.environ["DATABASE_URL"])
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
S3_BUCKET = os.environ["S3_BUCKET"]
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "").rstrip("/")
# DHgate blocks harder than 1688/Alibaba on IP + rate - keep delays generous.
MIN_DELAY = float(os.environ.get("MIN_DELAY_SECONDS", 5))
MAX_DELAY = float(os.environ.get("MAX_DELAY_SECONDS", 10))

s3 = boto3.client("s3", region_name=AWS_REGION)


def polite_delay():
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


def get_search_urls(keyword: str, pages: int) -> list[str]:
    base = f"https://www.dhgate.com/wholesale/search.do?act=search&sourceType=1&searchkey={quote(keyword)}"
    return [f"{base}&pageNum={i}" for i in range(1, pages + 1)]


def extract_listing_links(page) -> list[str]:
    """Grab product detail links from a search results page."""
    try:
        page.wait_for_selector("a[href*='/product/']", timeout=15000)
    except Exception:
        # Selector guess didn't match this run - save evidence instead of
        # just crashing, so the actual markup can be inspected and the
        # selector corrected precisely rather than guessed again.
        debug_dir = Path("debug_output")
        debug_dir.mkdir(exist_ok=True)
        page.screenshot(path=str(debug_dir / "search_page.png"), full_page=True)
        (debug_dir / "search_page.html").write_text(page.content(), encoding="utf-8")
        print(f"  ! No product links found with current selector.")
        print(f"  ! Saved {debug_dir / 'search_page.png'} and {debug_dir / 'search_page.html'} for inspection.")
        print(f"  ! Open the .png to see what actually loaded, or share both files to get the selector fixed.")
        return []

    hrefs = page.eval_on_selector_all(
        "a[href*='/product/']",
        "els => els.map(e => e.href)",
    )
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

    # If DHgate shows a captcha/verification page, stop rather than trying
    # to work around it.
    if page.locator("text=/verify|captcha/i").count() > 0:
        print("  ! captcha/verification page detected - stopping. Wait a while before retrying.")
        raise SystemExit(1)

    title = page.locator("h1").first.inner_text(timeout=8000) if page.locator("h1").count() else "Untitled"

    image_urls = page.eval_on_selector_all(
        "img[src*='dhresource.com']",
        "els => els.map(e => e.src).filter(s => s.includes('.jpg') || s.includes('.png') || s.includes('.jpeg') || s.includes('.webp'))",
    )
    image_urls = list(dict.fromkeys(image_urls))

    # crude product id from URL, e.g. .../product/12345678.html
    product_id = url.rstrip("/").split("/")[-1].replace(".html", "")

    return {
        "source": "dhgate",
        "source_id": product_id,
        "name": title.strip(),
        "sku": product_id,
        "source_url": url,
        "image_urls": image_urls[:10],
    }


def download_image(url: str) -> bytes | None:
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
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


def migrate_images(product: dict, category_path: str) -> dict:
    urls = []
    for idx, img_url in enumerate(product["image_urls"]):
        raw = download_image(img_url)
        if not raw:
            continue
        key = f"products/{category_path}/dhgate_{product['source_id']}_{idx}.jpg"
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
                (source, "sourceId", name, sku, category, "sourceUrl", "imageUrl", "allImages")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (source, "sourceId") DO NOTHING
            """,
            (
                product["source"],
                product["source_id"],
                product["name"],
                product["sku"],
                product["category_path"],
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
    parser.add_argument(
        "--category",
        required=True,
        help="Folder path matching your existing S3 layout",
    )
    parser.add_argument("--pages", type=int, default=int(os.environ.get("MAX_PAGES_PER_KEYWORD", 1)))
    args = parser.parse_args()
    category_path = args.category.strip("/")

    conn = psycopg2.connect(DATABASE_URL)

    with sync_playwright() as p:
        # Selectors confirmed working - back to headless for normal/batch runs.
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

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
            product["category_path"] = category_path
            product = migrate_images(product, category_path)
            insert_product(conn, product)
            polite_delay()

        browser.close()

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
