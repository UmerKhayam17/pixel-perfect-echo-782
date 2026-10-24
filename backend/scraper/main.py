"""Lead scraper entry point, spawned by the Node backend once per search.

Usage: python main.py '<json search params>'
"""

import asyncio
import json
import os
import re
import sys
import warnings
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from email_finder import inspect_site, make_client
from protocol import Control, emit, log
from sources import google_maps, google_places

ENRICH_CONCURRENCY = 6


def build_query(params: dict) -> str:
    what = " ".join(p for p in (params.get("keyword"), params["niche"]) if p)
    where = ", ".join(p for p in (params.get("city"), params["country"]) if p)
    return f"{what} in {where}"


def guess_city(address: str | None, searched_city: str | None) -> str:
    """Best effort: '12 Main St, Austin, TX 78701, United States' -> 'Austin'."""
    if not address:
        return searched_city or ""
    if searched_city and searched_city.lower() in address.lower():
        return searched_city
    parts = [p.strip() for p in address.split(",")][:-1]  # drop the country
    for part in reversed(parts):
        words = [w for w in part.split() if not re.search(r"\d", w)]
        candidate = re.sub(r"^(Co\.|County)\s+", "", " ".join(words))
        # Skip state codes ("TX") and fragments that were only a postcode.
        if candidate and not re.fullmatch(r"[A-Z]{2,3}", candidate):
            return candidate
    return searched_city or ""


def clean_url(url: str | None) -> str | None:
    """Drops utm_* tracking parameters that Google appends to listing websites."""
    if not url:
        return None
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query) if not k.lower().startswith("utm_")]
    return urlunparse(parsed._replace(query=urlencode(query)))


PLACE_ID_RE = re.compile(r"!19s(ChIJ[\w-]+)")


def profile_url(place: dict) -> str | None:
    """Short, stable Google Business Profile link built from the place id when known."""
    place_id = place.get("place_id")
    if not place_id and place.get("url"):
        match = PLACE_ID_RE.search(place["url"])
        place_id = match.group(1) if match else None
    if place_id:
        place["place_id"] = place_id
        return f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    return place.get("url", "").split("?")[0] or None


async def run(params: dict, control: Control) -> None:
    max_results = int(params["maxResults"])
    contact_types = set(params.get("contactTypes") or [])
    # "any" | "with" (only businesses that list a website) | "without" (only those that don't).
    website_filter = params.get("websiteFilter") or ("with" if params.get("onlyWithWebsites") else "any")
    # When filtering, let the source keep reading listings until enough of them match.
    source_limit = max_results if website_filter == "any" else None
    query = build_query(params)

    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    source = params.get("source") or "auto"
    if source == "google_places" and not api_key:
        raise RuntimeError("Lead source is set to Google Places API, but no API key is configured in Settings.")
    if source == "google_places" or (source == "auto" and api_key):
        source_name = "Google Places API"
        places = google_places.search(query, source_limit, api_key, control)
    else:
        source_name = "Google Maps"
        places = google_maps.search(query, source_limit, control, headless=params.get("headless", True))
    emit("source", source=source_name)

    emitted = 0
    semaphore = asyncio.Semaphore(ENRICH_CONCURRENCY)
    pending: set[asyncio.Task] = set()

    async with make_client() as http:

        async def finish_lead(place: dict) -> None:
            nonlocal emitted
            email, audit, socials = None, None, None
            # Every website gets a quick audit; the email hunt only runs when emails were requested.
            if place.get("website"):
                async with semaphore:
                    if not control.cancelled:
                        site = await inspect_site(http, place["website"], want_email="email" in contact_types)
                        email, audit, socials = site["email"], site["audit"], site["socials"]
            emitted += 1
            emit(
                "lead",
                lead={
                    "businessName": place["name"],
                    "category": place.get("category") or params["niche"],
                    "country": params["country"],
                    "city": guess_city(place.get("address"), params.get("city")),
                    "address": place.get("address"),
                    "phone": place.get("phone") if "phone" in contact_types else None,
                    "email": email,
                    # The website is always kept: it is the lead's main identifier besides the profile.
                    "website": place.get("website"),
                    "source": source_name,
                    "placeId": place.get("place_id"),
                    "sourceUrl": profile_url(place),
                    "rating": place.get("rating"),
                    "reviewCount": place.get("reviewCount"),
                    "businessStatus": place.get("businessStatus"),
                    "lat": place.get("lat"),
                    "lng": place.get("lng"),
                    "audit": audit,
                    "socials": socials,
                },
            )
            emit("progress", progress=round(emitted / max_results * 100, 1))

        accepted = 0
        skipped = 0
        try:
            async for place in places:
                if not await control.checkpoint():
                    break
                place["website"] = clean_url(place.get("website"))
                if not place.get("name"):
                    continue
                if (website_filter == "with" and not place.get("website")) or (
                    website_filter == "without" and place.get("website")
                ):
                    skipped += 1
                    if skipped % 10 == 0:
                        emit("status", text=f"{accepted} matching businesses so far, {skipped} skipped by the website filter…")
                    continue
                accepted += 1
                task = asyncio.create_task(finish_lead(place))
                pending.add(task)
                task.add_done_callback(pending.discard)
                if accepted >= max_results:
                    break
        finally:
            # Close the source now (e.g. its browser) rather than at interpreter shutdown.
            await places.aclose()

        if pending:
            emit("status", text="Checking business websites…")
            await asyncio.gather(*pending)

    emit("status", text=f"Done — {emitted} businesses collected from {source_name}.")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    warnings.filterwarnings("ignore", message="Unverified HTTPS request")

    params = json.loads(sys.argv[1])
    control = Control()
    control.listen()
    try:
        asyncio.run(run(params, control))
    except Exception as exc:  # report to the backend instead of a bare traceback
        log(f"Scraper failed: {exc!r}")
        emit("error", message=str(exc) or exc.__class__.__name__)
        return 1
    return 0


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    sys.stderr.flush()
    # The stdin listener thread blocks normal interpreter shutdown on Windows.
    os._exit(code)
