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

// ISO instant → "YYYY-MM-DDTHH:mm" in the user's local zone, for datetime-local inputs.
// (toISOString().slice(0,16) shows UTC and shifts the appointment on every edit.)
export function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
