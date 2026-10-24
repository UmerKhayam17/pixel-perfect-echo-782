"""Enriches leads that are already saved: website audit + email + social links, and fresh Google
rating / review count / status from each lead's Google profile.

Usage: python enrich.py <path to JSON file>
  {"leads": [{"id", "website", "sourceUrl", "wantEmail", "wantGoogle"}], "headless": true}

Emits NDJSON on stdout ("result" per lead, plus "progress"/"status"); reads pause/resume/cancel on stdin.
"""

import asyncio
import json
import os
import random
import sys
import warnings

from email_finder import inspect_site, make_client
from protocol import Control, emit, log

CONCURRENCY = 6


async def check_websites(leads: list[dict], control: Control, done: list[int], total: int) -> None:
    semaphore = asyncio.Semaphore(CONCURRENCY)
    async with make_client() as http:

        async def one(lead: dict) -> None:
            async with semaphore:
                if not await control.checkpoint():
                    return
                site = await inspect_site(http, lead["website"], want_email=bool(lead.get("wantEmail")))
                emit("result", id=lead["id"], email=site["email"], audit=site["audit"], socials=site["socials"])
                done[0] += 1
                emit("progress", done=done[0], total=total)

        await asyncio.gather(*(one(l) for l in leads))


async def check_google(leads: list[dict], control: Control, headless: bool, done: list[int], total: int) -> None:
    from playwright.async_api import async_playwright
    from sources.google_maps import _accept_consent, _read_listing

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        try:
            context = await browser.new_context(
                locale="en-US",
                viewport={"width": 1366, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
                ),
            )
            page = await context.new_page()
            consent_checked = False
            for lead in leads:
                if not await control.checkpoint():
                    return
                url = lead["sourceUrl"]
                url += ("&" if "?" in url else "?") + "hl=en"
                if not consent_checked:
                    await page.goto(url, wait_until="domcontentloaded")
                    await _accept_consent(page)
                    consent_checked = True
                listing = await _read_listing(page, url)
                if listing:
                    emit(
                        "result",
                        id=lead["id"],
                        rating=listing.get("rating"),
                        reviewCount=listing.get("reviewCount"),
                        businessStatus=listing.get("businessStatus"),
                        lat=listing.get("lat"),
                        lng=listing.get("lng"),
                        # A website found on the profile that the lead doesn't have yet.
                        website=listing.get("website"),
                    )
                done[0] += 1
                emit("progress", done=done[0], total=total)
                await page.wait_for_timeout(random.randint(500, 1300))
        finally:
            try:
                await asyncio.wait_for(browser.close(), timeout=10)
            except Exception as exc:
                log(f"Browser did not close cleanly: {exc!r}")


async def run(job: dict, control: Control) -> None:
    leads = job["leads"]
    sites = [l for l in leads if l.get("website")]
    google = [l for l in leads if l.get("wantGoogle") and l.get("sourceUrl")]
    total = len(sites) + len(google)
    done = [0]
    emit("progress", done=0, total=total)
    if sites:
        emit("status", text=f"Checking {len(sites)} websites…")
        await check_websites(sites, control, done, total)
    if google and not control.cancelled:
        emit("status", text=f"Reading {len(google)} Google profiles…")
        await check_google(google, control, job.get("headless", True), done, total)
    emit("status", text=f"Done — {done[0]} checks completed.")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    warnings.filterwarnings("ignore", message="Unverified HTTPS request")
    with open(sys.argv[1], encoding="utf-8") as f:
        job = json.load(f)
    control = Control()
    control.listen()
    try:
        asyncio.run(run(job, control))
    except Exception as exc:
        log(f"Enrich failed: {exc!r}")
        emit("error", message=str(exc) or exc.__class__.__name__)
        return 1
    return 0


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
