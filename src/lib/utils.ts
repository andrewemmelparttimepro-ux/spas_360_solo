import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PostgREST .or() filters are a comma/paren grammar — a search for "Smith, John"
// would otherwise splice into the filter expression and error the whole query.
export function sanitizeSearchTerm(term: string) {
  return term.replace(/[,()\\%]/g, ' ').replace(/\s+/g, ' ').trim();
}

// One phone format everywhere: raw imports arrive as "7016410155", hand entry as
// "(701) 641-8918" — display both as (701) 641-8918. Anything that isn't a plain
// 10-digit US number (short test data, extensions) passes through untouched.
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return phone;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

// ISO instant → "YYYY-MM-DDTHH:mm" in the user's local zone, for datetime-local inputs.
// (toISOString().slice(0,16) shows UTC and shifts the appointment on every edit.)
export function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
