import type { InventoryItem } from '@/types';

export const inventoryItems: InventoryItem[] = [
  { id: 'INV-001', sku: 'SUN-OPT-880-01', product: 'Sundance Optima 880', category: 'Hot Tub', status: 'In Stock', location: 'Minot', price: 14200 },
  { id: 'INV-002', sku: 'CAL-UTO-02', product: 'Caldera Utopia', category: 'Hot Tub', status: 'Sold (Awaiting Delivery)', location: 'Bismarck', price: 16000 },
  { id: 'INV-003', sku: 'JAC-J300-01', product: 'Jacuzzi J-300', category: 'Hot Tub', status: 'On Order', location: 'Minot', price: 9500 },
  { id: 'INV-004', sku: 'CHM-CHL-50', product: 'Chlorine Granules 50lb', category: 'Chemicals', status: 'In Stock', location: 'Bismarck', price: 120 },
  { id: 'INV-005', sku: 'ACC-CVR-8X8', product: 'Premium Cover 8x8', category: 'Accessories', status: 'In Transit', location: 'Minot', price: 450 },
];
