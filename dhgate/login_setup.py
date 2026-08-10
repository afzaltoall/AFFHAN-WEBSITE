"""
Run this ONCE, manually, before running the scraper.

It opens a real browser window pointed at Alibaba.com login page.
You log in yourself (email/password, or Google/Facebook login), like a
normal user. Once logged in, press Enter in the terminal — it saves your
session (cookies + local storage) to storage_state.json, which the scraper
reuses so it doesn't have to log in every run.

Usage:
    python login_setup.py
"""

from playwright.sync_api import sync_playwright

STORAGE_STATE_PATH = "storage_state.json"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            channel="chrome",  # use your real installed Chrome, not the bundled test build
            args=["--auto-open-devtools-for-tabs=false"],
        )
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://login.alibaba.com/")

        print("\nBrowser opened. Log in to Alibaba.com manually in the window.")
        input("Once you're logged in and can see your account, press Enter here...")

        context.storage_state(path=STORAGE_STATE_PATH)
        print(f"Session saved to {STORAGE_STATE_PATH}")

        browser.close()


if __name__ == "__main__":
    main()
