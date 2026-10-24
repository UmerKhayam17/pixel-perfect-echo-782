import { useId, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLeadFacets } from "@/hooks/queries";

/** Free-form tag editor: Enter or comma adds a tag, Backspace on an empty field removes the last one. */
export function TagInput({
  value,
  onChange,
  placeholder = "Add tag…",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const { data: facets } = useLeadFacets();
  const suggestions = facets?.tags.filter((t) => !value.includes(t)) ?? [];

  const add = (raw: string) => {
    const tag = raw.trim().slice(0, 40);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1 pr-1">
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={(e) => {
          // Picking a datalist suggestion fires a change with the full tag.
          if (suggestions.includes(e.target.value)) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
