import type { PublicUser } from '@shipment-tracker/shared';

export const USER: PublicUser = {
  id: 'u1',
  email: 'client@demo.dev',
  name: 'Demo Client',
  role: 'CLIENT',
  createdAt: '2026-11-13T10:00:00.000Z',
};

export const DISPATCHER: PublicUser = {
  id: 'u2',
  email: 'dispatcher@demo.dev',
  name: 'Demo Dispatcher',
  role: 'DISPATCHER',
  createdAt: '2026-11-13T10:00:00.000Z',
};
