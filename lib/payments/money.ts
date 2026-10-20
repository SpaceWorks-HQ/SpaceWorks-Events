/**
 * Money is integer minor units (paise for INR) with an uppercase ISO 4217
 * code. Nothing here multiplies a float amount: the number of minor digits
 * comes from ISO 4217 exponents, so zero-decimal (JPY) and three-decimal (KWD)
 * currencies charge and refund the right amount. Client-safe.
 */

/** ISO 4217 currencies with no minor unit, matching Stripe's zero-decimal list. */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
/** ISO 4217 currencies with three minor digits. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** The largest single amount accepted anywhere: 10^12 minor units. */
export const MAX_AMOUNT_MINOR = BigInt("1000000000000");
const ZERO = BigInt(0);

/** 10^digits as a bigint, without `**` (which some build targets rewrite to Math.pow). */
function scale(digits: number): bigint {
  let result = BigInt(1);
  for (let index = 0; index < digits; index += 1) result *= BigInt(10);
  return result;
}

export const DEFAULT_CURRENCY = "INR";

/** Minor digits for a currency: 0, 2 or 3. */
export function currencyExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** An uppercase three-letter code that Intl recognises. */
export function isValidCurrency(currency: string): boolean {
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    return Intl.supportedValuesOf("currency").includes(currency);
  } catch {
    return false;
  }
}

function toBigInt(amountMinor: bigint | number): bigint {
  if (typeof amountMinor === "bigint") return amountMinor;
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Amounts must be whole minor units.");
  return BigInt(amountMinor);
}

/** "1250.50" for 125050 INR: a plain decimal for inputs and CSV, no grouping or symbol. */
export function minorToDecimalString(amountMinor: bigint | number, currency: string): string {
  const value = toBigInt(amountMinor);
  const digits = currencyExponent(currency);
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  if (digits === 0) return `${negative ? "-" : ""}${abs}`;
  const factor = scale(digits);
  return `${negative ? "-" : ""}${abs / factor}.${String(abs % factor).padStart(digits, "0")}`;
}

/** "₹1,250.50" from 125050 minor units. The decimal string keeps precision. */
export function formatMoney(amountMinor: bigint | number, currency: string, locale = "en-IN"): string {
  const digits = currencyExponent(currency);
  const decimal = minorToDecimalString(amountMinor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(decimal as unknown as number);
  } catch {
    return `${currency} ${decimal}`;
  }
}

/**
 * Parse a typed amount ("1,250.5", "₹ 99") into minor units. Returns null for
 * anything that is not a non-negative amount with at most the currency's
 * minor digits, or that exceeds MAX_AMOUNT_MINOR.
 */
export function parseMoneyToMinor(input: string, currency: string): bigint | null {
  const digits = currencyExponent(currency);
  const cleaned = input.trim().replace(/[\s,]/g, "").replace(/^[^\d.-]+/, "");
  const pattern = digits > 0 ? new RegExp(`^\\d{1,15}(\\.\\d{1,${digits}})?$`) : /^\d{1,15}$/;
  if (!pattern.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const minor = BigInt(whole) * scale(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  return minor <= MAX_AMOUNT_MINOR ? minor : null;
}

/** Parse a stored or provider-sent integer amount; null when it is not a safe whole number. */
export function parseMinorAmount(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= ZERO && value <= MAX_AMOUNT_MINOR ? value : null;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 && BigInt(value) <= MAX_AMOUNT_MINOR ? BigInt(value) : null;
  if (typeof value === "string" && /^\d{1,13}$/.test(value)) return parseMinorAmount(BigInt(value));
  return null;
}
