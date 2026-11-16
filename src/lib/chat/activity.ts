import type { ActivityOutcome, ActivityRow } from "../../../shared/view/activity";

export type { ActivityOutcome, ActivityRow };

export interface ActivityDay {
  label: string;
  key: string;
  rows: ActivityRow[];
}

const localDayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(date: Date, now: Date): string {
  const key = localDayKey(date);
  if (key === localDayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return "Yesterday";
  const base = `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export function groupActivityByDay(rows: ActivityRow[], now: Date): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const row of rows) {
    const date = new Date(row.at);
    const key = localDayKey(date);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else days.push({ key, label: dayLabel(date, now), rows: [row] });
  }
  return days;
}

export type ChipTone = "ok" | "danger" | "accent" | "warn";

export function outcomeChip(outcome: ActivityOutcome): { text: string; tone: ChipTone } {
  switch (outcome) {
    case "ran":
      return { text: "Ran", tone: "ok" };
    case "failed":
      return { text: "Failed", tone: "danger" };
    case "running":
      return { text: "Running", tone: "accent" };
    case "allowed":
      return { text: "Allowed", tone: "ok" };
    case "denied":
      return { text: "Denied", tone: "danger" };
    case "waiting":
      return { text: "Needs you", tone: "warn" };
  }
}

export function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
