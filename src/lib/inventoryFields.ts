const FLOORING_STATUS =
  /^(?:(.*?)\s+)?(Wells Fargo|WF|TCCU(?:\s+Minot)?|MCHL(?:\s+TCCU)?|Consignment(?:\s+from\s+.+)?|Paid Off(?:\s+by\s+.+)?|Spas Etc(?:\s+TCCU)?|Spas TCCU)$/i;

const ORDER_REFERENCE = /^order(?:ed)?(?:\b|(?=[#:/-]))/i;
const NON_SERIAL_PLACEHOLDER =
  /^(?:pending|serial\s+pending|awaiting\s+serial(?:\s+number)?|tbd|tba|unknown|n\/?a|not\s+(?:assigned|available)|no\s+serial(?:\s+number)?)$/i;

export type InventorySerialAndFlooring = {
  serial: string;
  flooring: string;
};

export const splitSerialAndFlooring = (sku: string | null): InventorySerialAndFlooring => {
  const value = (sku ?? '').trim();
  const quoted = value.match(/^(.*?)\s*["“](.+?)["”]\s*$/);
  if (quoted) return { serial: quoted[1].trim(), flooring: quoted[2].trim() };

  const knownFlooring = value.match(FLOORING_STATUS);
  return knownFlooring
    ? { serial: (knownFlooring[1] ?? '').trim(), flooring: knownFlooring[2].trim() }
    : { serial: value, flooring: '' };
};

export const serialNumberForDisplay = (serial: string) => {
  const value = serial.trim();
  return ORDER_REFERENCE.test(value) || NON_SERIAL_PLACEHOLDER.test(value) ? '' : value;
};

export const joinSerialAndFlooring = (serial: string, flooring: string) =>
  flooring.trim() ? `${serial.trim()} "${flooring.trim()}"`.trim() : serial.trim();
