import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Merge fields shown as insert buttons; the backend accepts the same names. */
export const MERGE_FIELDS: { key: string; label: string; example: string }[] = [
  { key: "businessName", label: "Business name", example: "{{businessName}}" },
  { key: "firstName", label: "First name", example: "{{firstName|there}}" },
  { key: "contactName", label: "Contact name", example: "{{contactName}}" },
  { key: "category", label: "Category", example: "{{category}}" },
  { key: "city", label: "City", example: "{{city}}" },
  { key: "country", label: "Country", example: "{{country}}" },
  { key: "website", label: "Website", example: "{{website}}" },
  { key: "phone", label: "Phone", example: "{{phone}}" },
  { key: "senderName", label: "Your name", example: "{{senderName}}" },
  { key: "signature", label: "Signature", example: "{{signature}}" },
];

export const STARTER_TEMPLATES: { name: string; subject: string; body: string }[] = [
  {
    name: "Website for businesses without one",
    subject: "A website for {{businessName}}?",
    body: `Hi {{firstName|there}},

I came across {{businessName}} on Google Maps while looking for {{category}} in {{city}}. Your reviews look great, but I couldn't find a website for you.

Most customers check a website before they call. We build fast, mobile-friendly sites for local businesses like yours, usually within a week.

Would you be open to a quick 10-minute call this week? I can show you a free mock-up for {{businessName}}.

Best regards,`,
  },
  {
    name: "Website redesign / SEO",
    subject: "Quick idea for {{businessName}}'s website",
    body: `Hi {{firstName|there}},

I had a look at {{website}} and noticed a few quick wins that could bring {{businessName}} more customers from Google in {{city}}: page speed, mobile layout and local search listings.

I'd be happy to send a short free audit with screenshots. Shall I?

Thanks,`,
  },
  {
    name: "Follow-up",
    subject: "Re: {{businessName}}",
    body: `Hi {{firstName|there}},

Just following up on my earlier email in case it got buried. Is improving your online presence something {{businessName}} is thinking about this year?

If now isn't a good time, just let me know and I won't follow up again.

Cheers,`,
  },
];

/**
 * Subject + body fields with buttons that insert merge fields at the cursor
 * of whichever field was focused last.
 */
export function EmailEditor({
  subject,
  body,
  onChange,
  errors = {},
  hideSubject = false,
  subjectPlaceholder = "e.g. A website for {{businessName}}?",
  idPrefix = "email",
  rows = 14,
  showSignatureField = true,
}: {
  subject: string;
  body: string;
  onChange: (patch: { subject?: string; body?: string }) => void;
  errors?: Record<string, string>;
  /** WhatsApp messages have no subject. */
  hideSubject?: boolean;
  subjectPlaceholder?: string;
  /** Unique per editor when several are on one page. */
  idPrefix?: string;
  rows?: number;
  showSignatureField?: boolean;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  function insert(token: string) {
    const target = lastFocused.current;
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    const value = target === "subject" ? subject : body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange({ [target]: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-4">
      {!hideSubject && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-subject`}>Subject</Label>
          <Input
            id={`${idPrefix}-subject`}
            ref={subjectRef}
            value={subject}
            onFocus={() => (lastFocused.current = "subject")}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder={subjectPlaceholder}
            aria-invalid={!!errors["subject"]}
          />
          {errors["subject"] && <p className="text-xs text-destructive">{errors["subject"]}</p>}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-body`}>Message</Label>
        <Textarea
          id={`${idPrefix}-body`}
          ref={bodyRef}
          rows={rows}
          value={body}
          onFocus={() => (lastFocused.current = "body")}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder={"Hi {{firstName|there}},\n\n…"}
          className="font-mono text-[13px] leading-relaxed"
          aria-invalid={!!errors["body"]}
        />
        {errors["body"] && <p className="text-xs text-destructive">{errors["body"]}</p>}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Insert personal details — click to add at the cursor:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MERGE_FIELDS.filter((f) => showSignatureField || f.key !== "signature").map((f) => (
            <button
              key={f.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(f.example)}
              className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              title={f.example}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Add a fallback after a bar for leads missing that detail: {"{{firstName|there}}"} becomes
          “Hi there” when no contact name is known.
        </p>
      </div>
    </div>
  );
}

export const WHATSAPP_STARTER_TEMPLATES: { name: string; body: string }[] = [
  {
    name: "WhatsApp: no website",
    body: `Hello {{firstName|there}}! I'm {{senderName}}. I found {{businessName}} on Google Maps — great reviews!

I noticed you don't have a website yet. We build professional, mobile-friendly websites for businesses in {{city}} so more customers can find you online.

Can I send you a free sample design for {{businessName}}?`,
  },
  {
    name: "WhatsApp: website upgrade",
    body: `Hi {{firstName|there}}, this is {{senderName}}. I had a quick look at {{website}} and spotted a few easy improvements that could bring {{businessName}} more customers from Google.

Would you like a free 2-minute video review of your site?`,
  },
  {
    name: "WhatsApp: follow-up",
    body: `Hi {{firstName|there}}, just following up on my message about {{businessName}}'s online presence. Would a quick call this week work for you? 🙂`,
  },
];
