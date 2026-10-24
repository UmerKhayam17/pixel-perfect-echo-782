"""Google Maps scraper driven by Playwright.

One tab scrolls the search-results feed to discover listings; a second tab opens each
listing to read its details, so leads stream out while the feed is still loading.
Google changes its markup from time to time — selectors live in one place below.
"""

import asyncio
import random
import re
from typing import AsyncIterator
from urllib.parse import parse_qs, quote_plus, urlparse

from playwright.async_api import Page, TimeoutError as PlaywrightTimeout, async_playwright

from protocol import Control, emit, log

FEED = 'div[role="feed"]'
LISTING_LINKS = 'div[role="feed"] a[href*="/maps/place/"]'
END_OF_LIST = "text=You've reached the end of the list"
CONSENT_BUTTONS = [
    'button[aria-label="Accept all"]',
    'button:has-text("Accept all")',
    'form[action*="consent"] button',
]

EXTRACT_DETAILS_JS = r"""
() => {
  const q = (s) => document.querySelector(s);
  const strip = (el, prefix) => {
    if (!el) return null;
    const label = el.getAttribute("aria-label") || el.textContent || "";
    return label.replace(prefix, "").trim() || null;
  };
  return {
    name: (q("h1.DUwDvf") || q("h1"))?.textContent?.trim() || null,
    category: (q("button.DkEaL") || q('button[jsaction*="category"]'))?.textContent?.trim() || null,
    address: strip(q('button[data-item-id="address"]'), /^Address:\s*/),
    phone: strip(q('button[data-item-id^="phone:tel:"]'), /^Phone:\s*/),
    website: q('a[data-item-id="authority"]')?.href || null,
    // "4.9 stars " on the rating, "327 reviews" on the review count.
    rating: (() => {
      const label = q('div.F7nice [aria-label*="star"]')?.getAttribute("aria-label") || q("div.F7nice span")?.textContent || "";
      const m = label.replace(",", ".").match(/\d+(\.\d+)?/);
      return m ? Number(m[0]) : null;
    })(),
    reviewCount: (() => {
      const el = [...document.querySelectorAll('[aria-label$=" reviews"], [aria-label$=" review"]')]
        .find((e) => /^[\d,.\s]+reviews?$/.test(e.getAttribute("aria-label").trim()));
      const text = el ? el.getAttribute("aria-label") : (q("div.F7nice")?.innerText.match(/\(([\d,.]+)\)/) || [])[1] || "";
      const n = Number(String(text).replace(/[^\d]/g, ""));
      return Number.isFinite(n) && text ? n : null;
    })(),
    businessStatus: (() => {
      const text = q('div[role="main"]')?.innerText || "";
      if (/Permanently closed/.test(text)) return "closed_permanently";
      if (/Temporarily closed/.test(text)) return "closed_temporarily";
      return "open";
    })(),
  };
}
"""


COORDS_RE = re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)")


def _coords(url: str) -> tuple[float, float] | tuple[None, None]:
    m = COORDS_RE.search(url)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def _clean_website(href: str | None) -> str | None:
    """Maps sometimes wraps outbound links in a google.com/url?q=… redirect."""
    if not href:
        return None
    parsed = urlparse(href)
    if parsed.netloc.endswith("google.com") and parsed.path == "/url":
        return parse_qs(parsed.query).get("q", [None])[0]
    return href


async def _accept_consent(page: Page) -> None:
    if "consent." not in page.url:
        return
    for selector in CONSENT_BUTTONS:
        button = page.locator(selector).first
        if await button.count():
            await button.click()
            await page.wait_for_load_state("domcontentloaded")
            return


async def _read_listing(page: Page, url: str) -> dict | None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_selector("h1", timeout=15000)
        # Contact buttons render a moment after the title.
        await page.wait_for_timeout(800)
    except PlaywrightTimeout:
        log(f"Timed out opening {url}")
        return None
    details = await page.evaluate(EXTRACT_DETAILS_JS)
    if not details.get("name"):
        return None
    details["website"] = _clean_website(details.get("website"))
    # The page URL settles on the full place URL, which carries the coordinates.
    details["lat"], details["lng"] = _coords(page.url) if _coords(page.url)[0] is not None else _coords(url)
    details["url"] = url
    return details


async def search(query: str, max_results: int | None, control: Control, headless: bool = True) -> AsyncIterator[dict]:
    """Yields up to `max_results` listings, or every listing in the feed when it is None."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            locale="en-US",
            viewport={"width": 1366, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            ),
        )
        try:
            results = await context.new_page()
            details = await context.new_page()

            emit("status", text=f"Opening Google Maps for “{query}”…")
            await results.goto(
                f"https://www.google.com/maps/search/{quote_plus(query)}?hl=en",
                wait_until="domcontentloaded",
            )
            await _accept_consent(results)

            try:
                await results.wait_for_selector(FEED, timeout=20000)
            except PlaywrightTimeout:
                # A very specific query jumps straight to a single place page.
                if "/maps/place/" in results.url:
                    listing = await _read_listing(details, results.url)
                    if listing:
                        yield listing
                else:
                    emit("status", text="Google Maps returned no results for this query.")
                return

            seen: set[str] = set()
            yielded = 0
            idle_scrolls = 0
            full = lambda: max_results is not None and yielded >= max_results  # noqa: E731
            while not full() and idle_scrolls < 8:
                if not await control.checkpoint():
                    return

                hrefs = await results.eval_on_selector_all(LISTING_LINKS, "els => els.map(e => e.href)")
                fresh = [h for h in hrefs if h not in seen]
                seen.update(fresh)
                idle_scrolls = 0 if fresh else idle_scrolls + 1

                for href in fresh:
                    if full() or not await control.checkpoint():
                        return
                    emit("status", text=f"Reading listing {yielded + 1} ({len(seen)} found on the map so far)…")
                    listing = await _read_listing(details, href)
                    if listing:
                        yielded += 1
                        yield listing
                    await details.wait_for_timeout(random.randint(400, 1200))

                if await results.locator(END_OF_LIST).count():
                    break
                await results.eval_on_selector(FEED, "el => el.scrollBy(0, el.scrollHeight)")
                await results.wait_for_timeout(random.randint(1500, 2500))
        finally:
            try:
                await asyncio.wait_for(browser.close(), timeout=10)
            except Exception as exc:
                log(f"Browser did not close cleanly: {exc!r}")
