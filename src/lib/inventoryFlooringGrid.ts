export const INVENTORY_FLOORING_DEFAULT_COLUMN_WIDTHS = [
  52,
  180,
  104,
  140,
  216,
  216,
  136,
  120,
] as const;

export const INVENTORY_FLOORING_MIN_COLUMN_WIDTHS = [
  44,
  88,
  64,
  80,
  112,
  104,
  88,
  84,
] as const;

export const INVENTORY_FLOORING_DEFAULT_ROW_HEIGHT = 52;
export const INVENTORY_FLOORING_MIN_ROW_HEIGHT = 36;
export const INVENTORY_FLOORING_MAX_ROW_HEIGHT = 180;
export const INVENTORY_FLOORING_MAX_COLUMN_WIDTH = 480;

const boundedSize = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

export function resizedInventoryFlooringColumnWidth(
  startWidth: number,
  deltaPixels: number,
  columnIndex: number,
) {
  const minimum = INVENTORY_FLOORING_MIN_COLUMN_WIDTHS[columnIndex];
  if (minimum === undefined) throw new RangeError(`Unknown inventory flooring column ${columnIndex}.`);
  return boundedSize(startWidth + deltaPixels, minimum, INVENTORY_FLOORING_MAX_COLUMN_WIDTH);
}

export function resizedInventoryFlooringRowHeight(startHeight: number, deltaPixels: number) {
  return boundedSize(
    startHeight + deltaPixels,
    INVENTORY_FLOORING_MIN_ROW_HEIGHT,
    INVENTORY_FLOORING_MAX_ROW_HEIGHT,
  );
}
