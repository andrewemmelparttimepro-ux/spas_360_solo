import type { UserRole } from '@/types/database';

export function isServiceTechnician(role: UserRole | null | undefined): boolean {
  return role === 'technician';
}

export function technicianCanAccessPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/service' || pathname.startsWith('/service/');
}

export function canManageServiceSchedule(role: UserRole | null | undefined): boolean {
  return role !== 'technician';
}

export function canEditServiceJob(role: UserRole | null | undefined): boolean {
  return role === 'owner_manager' || role === 'service_manager';
}
