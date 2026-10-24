export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDuration(seconds?: number): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatMoney(n: number, currency = "USD"): string {
  try {
    return n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    return `${currency} ${formatNumber(Math.round(n))}`;
  }
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Days from today (local time) to the given date: 0 today, -1 yesterday, 1 tomorrow. */
export function daysFromToday(iso: string): number {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(new Date()).getTime()) / 86400000);
}

export function dueLabel(iso: string): string {
  const days = daysFromToday(iso);
  const time = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  return formatDateTime(iso);
}
