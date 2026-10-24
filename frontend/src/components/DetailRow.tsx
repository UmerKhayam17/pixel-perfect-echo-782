import { toast } from "sonner";
import { Copy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied.`),
    () => toast.error("Could not access the clipboard."),
  );
}

export function DetailRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  href?: string | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          href ? (
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="break-words text-sm font-medium hover:text-primary"
            >
              {value}
            </a>
          ) : (
            <p className="break-words text-sm font-medium">{value}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Not found</p>
        )}
      </div>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => copyText(value, label)}
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
