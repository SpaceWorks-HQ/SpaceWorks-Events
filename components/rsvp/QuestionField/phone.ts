/* ---------- Phone ---------- */

export const phoneCountries = [
  ["AF", "Afghanistan", "+93"], ["AL", "Albania", "+355"], ["AR", "Argentina", "+54"], ["AU", "Australia", "+61"], ["AT", "Austria", "+43"], ["BD", "Bangladesh", "+880"], ["BE", "Belgium", "+32"], ["BR", "Brazil", "+55"], ["CA", "Canada", "+1"], ["CL", "Chile", "+56"], ["CN", "China", "+86"], ["CO", "Colombia", "+57"], ["DK", "Denmark", "+45"], ["EG", "Egypt", "+20"], ["FI", "Finland", "+358"], ["FR", "France", "+33"], ["DE", "Germany", "+49"], ["GR", "Greece", "+30"], ["HK", "Hong Kong", "+852"], ["HU", "Hungary", "+36"], ["IN", "India", "+91"], ["ID", "Indonesia", "+62"], ["IE", "Ireland", "+353"], ["IL", "Israel", "+972"], ["IT", "Italy", "+39"], ["JP", "Japan", "+81"], ["KE", "Kenya", "+254"], ["MY", "Malaysia", "+60"], ["MX", "Mexico", "+52"], ["NL", "Netherlands", "+31"], ["NZ", "New Zealand", "+64"], ["NG", "Nigeria", "+234"], ["NO", "Norway", "+47"], ["PK", "Pakistan", "+92"], ["PH", "Philippines", "+63"], ["PL", "Poland", "+48"], ["PT", "Portugal", "+351"], ["QA", "Qatar", "+974"], ["RO", "Romania", "+40"], ["RU", "Russia", "+7"], ["SA", "Saudi Arabia", "+966"], ["SG", "Singapore", "+65"], ["ZA", "South Africa", "+27"], ["KR", "South Korea", "+82"], ["ES", "Spain", "+34"], ["SE", "Sweden", "+46"], ["CH", "Switzerland", "+41"], ["TW", "Taiwan", "+886"], ["TH", "Thailand", "+66"], ["TR", "Turkey", "+90"], ["AE", "United Arab Emirates", "+971"], ["GB", "United Kingdom", "+44"], ["US", "United States", "+1"], ["VN", "Vietnam", "+84"],
].map(([id, label, dial]) => ({ id, label, dial }));

export function getPhoneParts(raw: unknown) {
  const s = normalizePhoneInput(typeof raw === "string" ? raw : "");
  const knownDial = [...phoneCountries]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => s.startsWith(c.dial))?.dial;
  // Calling codes are at most three digits. Retaining an unlisted prefix lets
  // attendees use every E.164 country code, not only the convenience list.
  const dial = knownDial ?? s.match(/^\+\d{1,3}/)?.[0] ?? "+91";
  const number = s.startsWith(dial) ? s.slice(dial.length) : s;
  return { dial, number: number.replace(/[^\d]/g, "") };
}

function normalizePhoneInput(value: string) {
  const trimmed = value.trim();
  const withInternationalPrefix = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const digits = withInternationalPrefix.replace(/[^\d]/g, "");
  return withInternationalPrefix.startsWith("+") ? `+${digits.slice(0, 15)}` : digits.slice(0, 15);
}

function normalizeDial(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 3);
  return digits ? `+${digits}` : "+";
}

export function setPhoneValue(current: unknown, next: { dial?: string; number?: string }): string {
  const parts = getPhoneParts(current);
  const dial = next.dial ? normalizeDial(next.dial) : parts.dial;
  const number = (next.number ?? parts.number).replace(/[^\d]/g, "").slice(0, Math.max(0, 15 - (dial.length - 1)));
  return number ? `${dial}${number}` : "";
}

/**
 * The stored phone value after typing or pasting into the number box. Digits are
 * capped here rather than with `maxLength`, which would cut a pasted
 * "+91 98765 43210" or "98765 43210" short before it is normalised.
 */
export function phoneNumberInputValue(current: unknown, typed: string): string {
  if (typed.trimStart().startsWith("+") || typed.trimStart().startsWith("00")) return normalizePhoneInput(typed);
  const { dial } = getPhoneParts(current);
  const maxLength = dial === "+91" ? 10 : Math.max(1, 15 - (dial.length - 1));
  return setPhoneValue(current, { number: typed.replace(/[^\d]/g, "").slice(0, maxLength) });
}
