"""Official Google Places API (New) — Text Search.

Google caps a single text query at 60 results (3 pages of 20).
"""

from typing import AsyncIterator

import httpx

from protocol import Control, emit

PLACES_STATUS = {"CLOSED_PERMANENTLY": "closed_permanently", "CLOSED_TEMPORARILY": "closed_temporarily", "OPERATIONAL": "open"}
ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.primaryTypeDisplayName",
        "places.googleMapsUri",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
        "places.location",
        "nextPageToken",
    ]
)


async def search(query: str, max_results: int | None, api_key: str, control: Control) -> AsyncIterator[dict]:
    """Yields up to `max_results` places, or every page Google returns when it is None."""
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": FIELD_MASK}
    body: dict = {"textQuery": query, "pageSize": 20, "languageCode": "en"}
    yielded = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while max_results is None or yielded < max_results:
            if not await control.checkpoint():
                return
            emit("status", text=f"Querying Google Places for “{query}”…")
            response = await client.post(ENDPOINT, json=body, headers=headers)
            if response.status_code != 200:
                message = response.json().get("error", {}).get("message", response.text)
                raise RuntimeError(f"Google Places API error ({response.status_code}): {message}")

            data = response.json()
            for place in data.get("places", []):
                if max_results is not None and yielded >= max_results:
                    return
                yielded += 1
                yield {
                    "name": place.get("displayName", {}).get("text"),
                    "category": place.get("primaryTypeDisplayName", {}).get("text"),
                    "address": place.get("formattedAddress"),
                    "phone": place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber"),
                    "website": place.get("websiteUri"),
                    "url": place.get("googleMapsUri"),
                    "place_id": place.get("id"),
                    "rating": place.get("rating"),
                    "reviewCount": place.get("userRatingCount"),
                    "businessStatus": PLACES_STATUS.get(place.get("businessStatus"), "open"),
                    "lat": place.get("location", {}).get("latitude"),
                    "lng": place.get("location", {}).get("longitude"),
                }

            token = data.get("nextPageToken")
            if not token:
                return
            body["pageToken"] = token
