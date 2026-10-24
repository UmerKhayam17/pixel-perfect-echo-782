/**
 * Normalised match keys used to spot the same business across searches, imports and edits.
 * Two leads are considered duplicates when any enabled key is equal.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sites many unrelated businesses share, so their domain says nothing about identity.
const SHARED_HOSTS = new Set([
  "facebook.com", "fb.com", "m.facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl", "g.page",
  "wa.me", "whatsapp.com", "api.whatsapp.com", "linktr.ee", "yelp.com", "tripadvisor.com", "foursquare.com",
  "booking.com", "bit.ly", "t.me", "pinterest.com", "sites.google.com",
]);

// Words that don't distinguish one business name from another.
const NAME_NOISE = new Set([
  "the", "ltd", "limited", "llc", "inc", "incorporated", "co", "company", "corp", "corporation", "pvt",
  "private", "plc", "gmbh", "llp", "and", "&",
]);

export function emailKey(email) {
  const e = String(email ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return EMAIL_RE.test(e) ? e : null;
}

/** Last 9 digits, so "0300 1234567" and "+92 300 1234567" (or "051-…" and "+92 51 …") match. */
export function phoneKey(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function domainKey(url) {
  let value = String(url ?? "").trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z]+:\/\//.test(value)) value = `http://${value}`;
  try {
    const host = new URL(value).hostname.replace(/^www\d?\./, "");
    if (!host.includes(".") || SHARED_HOSTS.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

const normWords = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();

/** "The Smile Dental Clinic (Pvt) Ltd." in "Islamabad" -> "smile dental clinic|islamabad". */
export function nameKey(name, city) {
  const words = normWords(name).split(" ").filter((w) => w && !NAME_NOISE.has(w));
  if (!words.length) return null;
  return `${words.join(" ")}|${normWords(city)}`;
}

const PLACE_ID_PATTERNS = [/place_id:([\w-]+)/, /!19s(ChIJ[\w-]+)/, /[?&]query_place_id=([\w-]+)/];

export function placeIdFrom(lead) {
  if (lead.placeId) return String(lead.placeId).trim() || null;
  const url = String(lead.sourceUrl ?? "");
  for (const re of PLACE_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** All match keys for a lead-like object. */
export function keysFor(lead) {
  return {
    placeId: placeIdFrom(lead),
    emailKey: emailKey(lead.email),
    phoneKey: phoneKey(lead.phone),
    domainKey: domainKey(lead.website),
    nameKey: nameKey(lead.businessName, lead.city),
  };
}

/** Match keys in priority order, with the label shown to users. */
export const MATCH_KEYS = [
  { key: "placeId", label: "Google profile" },
  { key: "emailKey", label: "Email" },
  { key: "phoneKey", label: "Phone" },
  { key: "domainKey", label: "Website" },
  { key: "nameKey", label: "Name + city" },
];
