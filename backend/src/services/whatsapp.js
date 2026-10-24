import { renderText } from "./email.js";
import { callingCode, likelyMobile, whatsappNumber } from "./phone.js";

/**
 * WhatsApp outreach through click-to-chat links (https://wa.me/<number>?text=…). Free and needs no
 * API: the message opens prefilled in WhatsApp Web / the app, and the user presses send.
 */

export { callingCode, likelyMobile, whatsappNumber };

export function renderWhatsApp(body, lead, user, fallbackCountry) {
  const contactName = lead?.contactName ?? "";
  const ctx = {
    businessName: lead?.businessName ?? "",
    firstName: contactName.split(/\s+/)[0] ?? "",
    contactName,
    contactRole: lead?.contactRole ?? "",
    category: lead?.category ?? "",
    city: lead?.city ?? "",
    country: lead?.country ?? "",
    address: lead?.address ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    website: lead?.website ?? "",
    senderName: user?.name ?? "",
    senderEmail: user?.email ?? "",
    signature: "",
  };
  const text = renderText(body, ctx).trim();
  const number = whatsappNumber(lead?.phone, lead?.country, fallbackCountry);
  return {
    text,
    number,
    likelyMobile: likelyMobile(number),
    url: number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null,
  };
}
