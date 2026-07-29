import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date string (YYYY-MM-DD or MM/DD/YYYY) as a LOCAL date,
 * avoiding the UTC-midnight timezone shift that causes off-by-one display bugs.
 *
 * ❌ new Date("2000-07-09")           → Jul 8 in UTC-4 (wrong)
 * ✅ parseLocalDate("2000-07-09")     → Jul 9 always (correct)
 */
export function parseLocalDate(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  // If already a Date object, return it directly
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  // Handle YYYY-MM-DD (ISO date-only, no time)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  // Handle MM/DD/YYYY
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return new Date(Number(usMatch[3]), Number(usMatch[1]) - 1, Number(usMatch[2]));
  }
  // Fallback for full ISO timestamps (createdAt etc.) — these are fine with new Date()
  return new Date(dateStr);
}

/** Format a user-entered date string or Date object as "July 9, 2000" (long, no timezone shift) */
export function formatLocalDate(
  dateStr: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
): string | null {
  const d = parseLocalDate(dateStr);
  if (!d || isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", opts);
}

/** Format a user-entered date string or Date object as "Jul 9, 2000" (short) */
export function formatLocalDateShort(dateStr: string | Date | null | undefined): string | null {
  return formatLocalDate(dateStr, { month: "short", day: "numeric", year: "numeric" });
}
