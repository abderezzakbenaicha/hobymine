/**
 * Detects phone numbers in chat messages so both people see a safety reminder
 * before a conversation moves off the app. The check is deliberately
 * conservative: it accepts local, national and international formats while
 * ignoring dates, times and long numeric IDs that are not phone-like.
 */

/** Dates and times are stripped first so "2026-10-22 12:30" is not read as a number. */
const DATE_OR_TIME =
  /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?)\b/g;

/** A run of digits with the separators people use when writing a phone number. */
const PHONE_CANDIDATE = /(?:\+|00)?\d[\d\s().-]{5,}\d/g;

/** Seven-digit local numbers are only treated as phones when clearly formatted. */
const LOCAL_NUMBER = /(?:^|[\s(])\d{3}[-.\s]\d{4}(?:$|[\s).,!?])/;

function isPhoneLike(candidate: string): boolean {
  const text = candidate.trim();
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  // The general matcher needs at least 9 digits; shorter runs are only valid
  // when they use an explicit 3-4 separator (e.g. 555-1234).
  if (digits.length < 9 && !/^\d{3}[-.\s]\d{4}$/.test(text)) return false;
  return true;
}

export function containsPhoneNumber(input: string | null | undefined): boolean {
  if (!input) return false;
  const withoutDates = input.replace(DATE_OR_TIME, ' ');
  const candidates = withoutDates.match(PHONE_CANDIDATE) ?? [];
  if (candidates.some(isPhoneLike)) return true;
  return LOCAL_NUMBER.test(withoutDates);
}
