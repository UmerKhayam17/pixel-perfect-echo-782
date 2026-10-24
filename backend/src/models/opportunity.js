/**
 * Opportunity score (0–100): how promising a lead is for selling web & marketing services.
 * Problems with the business's online presence raise it; signs of an established, reachable
 * business raise it further. Each point comes with a human-readable reason.
 */

// Do-it-yourself builders: often a sign the site was never professionally built.
const DIY_PLATFORMS = ["Wix", "Weebly", "GoDaddy Builder", "Blogger", "Google Sites"];

export function computeOpportunity(lead, now = new Date()) {
  if (lead.businessStatus === "closed_permanently") return { opportunity: 0, opportunityReasons: ["Permanently closed"] };

  const reasons = [];
  let score = 0;
  const add = (points, reason) => {
    score += points;
    if (reason) reasons.push(reason);
  };
  const audit = lead.audit;

  if (!lead.website) add(35, "No website");
  else if (audit && audit.reachable === false) add(30, `Website not working${audit.error ? ` (${audit.error})` : ""}`);
  else if (audit?.reachable) {
    if (!audit.https) add(10, "No HTTPS (shows “Not secure”)");
    if (audit.mobileFriendly === false) add(15, "Not mobile-friendly");
    if (audit.loadMs > 4000) add(5, `Slow website (${(audit.loadMs / 1000).toFixed(1)} s)`);
    if (audit.copyrightYear && audit.copyrightYear <= now.getFullYear() - 3) add(10, `Site not updated since ${audit.copyrightYear}`);
    if (DIY_PLATFORMS.includes(audit.platform)) add(5, `Built with ${audit.platform}`);
  }

  if (lead.reviewCount >= 50) add(15, `${lead.reviewCount.toLocaleString("en-US")} Google reviews`);
  else if (lead.reviewCount >= 10) add(8, `${lead.reviewCount} Google reviews`);
  if (lead.rating >= 4) add(5, `Rated ${lead.rating}★`);
  if (lead.phone) add(10);
  if (lead.email) add(5);

  if (lead.businessStatus === "closed_temporarily") {
    score = Math.round(score / 2);
    reasons.push("Temporarily closed");
  }
  return { opportunity: Math.min(100, score), opportunityReasons: reasons };
}
