/** Phone-number helpers with no dependencies (used by models and the WhatsApp service). */

// Calling codes for countries leads commonly come from (lowercase country name -> code).
const CALLING_CODES = {
  pakistan: "92", india: "91", bangladesh: "880", "sri lanka": "94", nepal: "977", afghanistan: "93",
  "united arab emirates": "971", uae: "971", "saudi arabia": "966", qatar: "974", kuwait: "965", oman: "968",
  bahrain: "973", jordan: "962", lebanon: "961", egypt: "20", turkey: "90", iran: "98", iraq: "964",
  "united kingdom": "44", uk: "44", ireland: "353", germany: "49", france: "33", spain: "34", italy: "39",
  netherlands: "31", belgium: "32", sweden: "46", norway: "47", denmark: "45", poland: "48", portugal: "351",
  switzerland: "41", austria: "43", greece: "30", "united states": "1", usa: "1", canada: "1", mexico: "52",
  brazil: "55", argentina: "54", australia: "61", "new zealand": "64", "south africa": "27", nigeria: "234",
  kenya: "254", malaysia: "60", singapore: "65", indonesia: "62", philippines: "63", thailand: "66",
  vietnam: "84", china: "86", japan: "81", "south korea": "82", "hong kong": "852",
};

export const callingCode = (country) => CALLING_CODES[String(country ?? "").trim().toLowerCase()] ?? null;

/** International number without "+" (as wa.me expects), or null if it can't be worked out. */
export function whatsappNumber(phone, country, fallbackCountry) {
  const raw = String(phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  const code = callingCode(country) ?? callingCode(fallbackCountry);
  if (!code) return null;
  if (digits.startsWith(code) && digits.length > code.length + 7) return digits;
  digits = digits.replace(/^0+/, "");
  return code + digits;
}

/**
 * Whether the number is a mobile (so it can have WhatsApp). Known only for some countries;
 * null means "can't tell". Landlines like 051-xxxxxxx in Pakistan can't receive WhatsApp.
 */
export function likelyMobile(number) {
  if (!number) return false;
  if (number.startsWith("92")) return /^923\d{9}$/.test(number);
  if (number.startsWith("91")) return /^91[6-9]\d{9}$/.test(number);
  if (number.startsWith("971")) return /^9715\d{8}$/.test(number);
  if (number.startsWith("966")) return /^9665\d{8}$/.test(number);
  if (number.startsWith("44")) return /^447\d{9}$/.test(number);
  return null;
}

/** Renders a WhatsApp message for a lead. `user` fills {{senderName}}. */

/**
 * What kind of number a lead has: "mobile" (can have WhatsApp), "landline" (almost never does),
 * "unknown" (a number, but we can't tell for this country) or "none".
 */
export function phoneType(phone, country, fallbackCountry) {
  if (!String(phone ?? "").trim()) return "none";
  const mobile = likelyMobile(whatsappNumber(phone, country, fallbackCountry));
  return mobile === true ? "mobile" : mobile === false ? "landline" : "unknown";
}
