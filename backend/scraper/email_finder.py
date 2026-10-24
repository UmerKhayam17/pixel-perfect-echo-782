"""Inspects a business website: finds a public contact email (home page plus likely contact pages)
and audits the site — reachability, HTTPS, mobile support, speed, platform, age and social links."""

import html
import re
import time
from datetime import date
from urllib.parse import urljoin, urlparse

import httpx

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}")
HREF_RE = re.compile(r'href=["\']([^"\'#]+)["\']', re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
VIEWPORT_RE = re.compile(r'<meta[^>]+name=["\']viewport["\']', re.IGNORECASE)
GENERATOR_RE = re.compile(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)', re.IGNORECASE)
COPYRIGHT_RE = re.compile(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", re.IGNORECASE)
CONTACT_HINTS = ("contact", "about", "impressum", "kontakt", "reach", "get-in-touch")
FALLBACK_PATHS = ("/contact", "/contact-us", "/about", "/about-us")
IGNORED_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
IGNORED_DOMAINS = (
    "example.com", "domain.com", "email.com", "yourdomain.com", "sentry.io",
    "wixpress.com", "sentry-next.wixpress.com", "godaddy.com", "w3.org", "schema.org",
)
MAX_PAGES = 5

# Fingerprints in the home page HTML -> site platform.
PLATFORMS = (
    ("WordPress", ("wp-content/", "wp-includes/")),
    ("Wix", ("static.wixstatic.com", "wix.com/", "_wixCIDX")),
    ("Shopify", ("cdn.shopify.com", "Shopify.theme")),
    ("Squarespace", ("squarespace.com", "static1.squarespace")),
    ("Webflow", ("webflow.com", "w-webflow")),
    ("Weebly", ("weebly.com", "editmysite.com")),
    ("GoDaddy Builder", ("img1.wsimg.com", "godaddy.com/websites")),
    ("Blogger", ("blogger.com", "blogspot.com")),
    ("Google Sites", ("sites.google.com",)),
    ("Joomla", ("/media/jui/", "Joomla!")),
    ("Drupal", ("Drupal.settings", "/sites/default/files")),
)
SOCIAL_PATTERNS = {
    "facebook": re.compile(r"https?://(?:www\.|m\.)?(?:facebook|fb)\.com/(?!sharer|share|dialog|plugins|tr\b)[^\s\"'<>?]+", re.I),
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/(?!p/|share)[A-Za-z0-9_.]+", re.I),
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:company|in|school)/[^\s\"'<>?]+", re.I),
    "twitter": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/(?!intent|share|home)[A-Za-z0-9_]{2,}", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:@|channel/|c/|user/)[^\s\"'<>?]+", re.I),
    "tiktok": re.compile(r"https?://(?:www\.)?tiktok\.com/@[A-Za-z0-9_.]+", re.I),
    "whatsapp": re.compile(r"https?://(?:wa\.me|api\.whatsapp\.com/send)[^\s\"'<>]*", re.I),
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _emails_in(page_html: str) -> list[str]:
    text = html.unescape(page_html).replace("%40", "@")
    found = []
    for match in EMAIL_RE.findall(text):
        email = match.strip(".").lower()
        domain = email.split("@", 1)[1]
        if email.endswith(IGNORED_SUFFIXES) or domain in IGNORED_DOMAINS:
            continue
        if email not in found:
            found.append(email)
    return found


def _contact_links(base_url: str, page_html: str) -> list[str]:
    site = _domain(base_url)
    links = []
    for href in HREF_RE.findall(page_html):
        if href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base_url, href)
        if _domain(absolute) == site and any(h in absolute.lower() for h in CONTACT_HINTS):
            links.append(absolute)
    return links


def _best(emails: list[str], site: str) -> str | None:
    """Prefer an address on the business's own domain, then anything else found."""
    for email in emails:
        if email.split("@", 1)[1].endswith(site):
            return email
    return emails[0] if emails else None


def _socials(page_html: str, found: dict) -> None:
    text = html.unescape(page_html)
    for network, pattern in SOCIAL_PATTERNS.items():
        if network not in found:
            match = pattern.search(text)
            if match:
                found[network] = match.group(0).rstrip("/\\.,;")


def _audit_home(response: httpx.Response, elapsed_ms: int) -> dict:
    page = response.text
    title = TITLE_RE.search(page)
    generator = GENERATOR_RE.search(page)
    platform = next((name for name, marks in PLATFORMS if any(m in page for m in marks)), None)
    if not platform and generator:
        platform = generator.group(1).split()[0][:40]
    years = [int(y) for y in COPYRIGHT_RE.findall(page) if int(y) <= date.today().year]
    return {
        "reachable": True,
        "statusCode": response.status_code,
        "finalUrl": str(response.url),
        "https": str(response.url).startswith("https://"),
        "mobileFriendly": bool(VIEWPORT_RE.search(page)),
        "loadMs": elapsed_ms,
        "platform": platform,
        "title": html.unescape(title.group(1)).strip()[:200] if title else None,
        "copyrightYear": max(years) if years else None,
    }


async def inspect_site(client: httpx.AsyncClient, website: str, want_email: bool = True) -> dict:
    """Returns {"email", "audit", "socials"} for a business website."""
    if not website.startswith(("http://", "https://")):
        website = "https://" + website
    site = _domain(website)
    socials: dict = {}
    audit: dict = {"reachable": False}
    found: list[str] = []

    started = time.monotonic()
    try:
        home = await client.get(website)
    except httpx.HTTPError as exc:
        audit["error"] = type(exc).__name__.replace("Error", " error").replace("Exception", "").strip()
        return {"email": None, "audit": audit, "socials": socials}
    elapsed = int((time.monotonic() - started) * 1000)
    if home.status_code >= 400:
        audit.update({"statusCode": home.status_code, "error": f"HTTP {home.status_code}"})
        return {"email": None, "audit": audit, "socials": socials}
    if "html" not in home.headers.get("content-type", ""):
        audit.update({"statusCode": home.status_code, "error": "Not a web page"})
        return {"email": None, "audit": audit, "socials": socials}

    audit = _audit_home(home, elapsed)
    _socials(home.text, socials)
    found.extend(_emails_in(home.text))
    best = _best(found, site)
    if not want_email or (best and best.split("@", 1)[1].endswith(site)):
        return {"email": best if want_email else None, "audit": audit, "socials": socials}

    base = str(home.url)
    queue = list(dict.fromkeys(_contact_links(base, home.text) + [urljoin(base, p) for p in FALLBACK_PATHS]))
    visited = {website, base}
    while queue and len(visited) < MAX_PAGES + 1:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        try:
            response = await client.get(url)
        except httpx.HTTPError:
            continue
        if response.status_code >= 400 or "html" not in response.headers.get("content-type", ""):
            continue
        _socials(response.text, socials)
        found.extend(e for e in _emails_in(response.text) if e not in found)
        best = _best(found, site)
        if best and best.split("@", 1)[1].endswith(site):
            break
    return {"email": _best(found, site), "audit": audit, "socials": socials}


async def find_email(client: httpx.AsyncClient, website: str) -> str | None:
    return (await inspect_site(client, website))["email"]


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers=HEADERS,
        timeout=httpx.Timeout(12.0, connect=8.0),
        follow_redirects=True,
        verify=False,  # many small-business sites have broken certificate chains
    )
