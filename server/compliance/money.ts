/**
 * Money arithmetic without floating point.
 *
 * Rates and amounts are DECIMAL(12,2) in the database and are handled here as
 * strings parsed to INTEGER CENTS. Never use JS `number` math for money — 0.1 +
 * 0.2 !== 0.3 in IEEE-754, which silently corrupts invoices. All public helpers
 * take/return canonical decimal strings ("12.34") or integer cents.
 */

/** Parse a decimal money string (e.g. "12.34", "0", "1200.5") to integer cents. */
export function toCents(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const s = typeof value === "number" ? value.toString() : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`INVALID_MONEY:${s}`);
  const neg = s.startsWith("-");
  const [intPart, fracPartRaw = ""] = s.replace(/^-/, "").split(".");
  const frac = (fracPartRaw + "00").slice(0, 2);
  const cents = Number(intPart) * 100 + Number(frac);
  return neg ? -cents : cents;
}

/** Format integer cents to a canonical "0.00" decimal string. */
export function fromCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`NON_INTEGER_CENTS:${cents}`);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** units × rate → decimal string. Units are whole; rate is a money string. */
export function multiplyUnits(units: number, rate: string | number | null | undefined): string {
  if (!Number.isInteger(units) || units < 0) throw new Error(`INVALID_UNITS:${units}`);
  return fromCents(toCents(rate) * units);
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function sumMoney(values: string[]): string {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/** Compare two money strings: -1 | 0 | 1. */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

export function isNonNegativeMoney(a: string): boolean {
  return toCents(a) >= 0;
}
