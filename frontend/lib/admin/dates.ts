/** The admin works in India, so datetime-local inputs are read and written as Asia/Kolkata (+05:30). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** ISO instant -> "YYYY-MM-DDTHH:mm" in IST for a datetime-local input. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" (IST) -> ISO instant, or undefined when empty or invalid. */
export function fromLocalInput(value?: string | null): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(`${value.length === 16 ? value + ":00" : value}+05:30`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** "12 Mar 2026" in IST for tables. */
export function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/** "12 Mar 2026, 14:05" in IST, for things where the time of day matters. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}
