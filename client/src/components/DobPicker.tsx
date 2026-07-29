/**
 * DobPicker — three-dropdown date-of-birth selector
 *
 * Uses local state for month/day/year so each dropdown selection is
 * remembered independently. Only calls onChange with a complete
 * MM/DD/YYYY string once all three are filled; calls onChange("") if
 * any part is cleared.
 */
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  return new Date(year || 2000, month, 0).getDate();
}

function parseDobString(value: string): { month: number; day: number; year: number } {
  const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!parts) return { month: 0, day: 0, year: 0 };
  return {
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
    year: parseInt(parts[3], 10),
  };
}

interface DobPickerProps {
  /** Current value in MM/DD/YYYY format (or "" when empty) */
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  className?: string;
  /** "sm" for compact household-member rows, "base" (default) for main form */
  size?: "sm" | "base";
}

export function DobPicker({ value, onChange, error, className = "", size = "base" }: DobPickerProps) {
  // Initialise local state from the incoming value
  const parsed = parseDobString(value);
  const [month, setMonth] = useState<number>(parsed.month);
  const [day, setDay]     = useState<number>(parsed.day);
  const [year, setYear]   = useState<number>(parsed.year);

  // Sync inward when the parent resets the value (e.g. form clear)
  useEffect(() => {
    const p = parseDobString(value);
    setMonth(p.month);
    setDay(p.day);
    setYear(p.year);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === "" ? "" : null]); // only re-sync on explicit clear

  const currentYear = new Date().getFullYear();
  const maxDays = daysInMonth(month, year);

  function emit(m: number, d: number, y: number) {
    if (m && d && y) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      onChange(`${mm}/${dd}/${y}`);
    } else {
      onChange("");
    }
  }

  function handleMonth(val: string) {
    const m = parseInt(val, 10);
    setMonth(m);
    // Clamp day if it exceeds the new month's max
    const max = daysInMonth(m, year);
    const clampedDay = day > max ? 0 : day;
    if (clampedDay !== day) setDay(clampedDay);
    emit(m, clampedDay, year);
  }

  function handleDay(val: string) {
    const d = parseInt(val, 10);
    setDay(d);
    emit(month, d, year);
  }

  function handleYear(val: string) {
    const y = parseInt(val, 10);
    setYear(y);
    // Re-clamp day for leap-year changes
    const max = daysInMonth(month, y);
    const clampedDay = day > max ? 0 : day;
    if (clampedDay !== day) setDay(clampedDay);
    emit(month, clampedDay, y);
  }

  const triggerClass = `${size === "sm" ? "h-8 text-xs" : ""} ${error ? "border-red-400" : ""}`;

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {/* Month */}
      <Select value={month ? String(month) : ""} onValueChange={handleMonth}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent position="item-aligned" className="max-h-60 overflow-y-auto">
          {MONTHS.map((name, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Day */}
      <Select value={day ? String(day) : ""} onValueChange={handleDay}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent position="item-aligned" className="max-h-60 overflow-y-auto">
          {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Year — most recent first so common ages are at the top */}
      <Select value={year ? String(year) : ""} onValueChange={handleYear}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent position="item-aligned" className="max-h-60 overflow-y-auto">
          {Array.from({ length: 121 }, (_, i) => currentYear - i).map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
