import { type UserSummary, userListResponseSchema } from '@shipment-tracker/shared';

import { apiRequest } from '@/lib/api/client';

/** GET /users?role=CLIENT (dispatcher only) → the clients, ordered by name. */
export async function fetchClients(): Promise<UserSummary[]> {
  const { items } = await apiRequest('/users?role=CLIENT', {
    schema: userListResponseSchema,
    retryWhenUnavailable: true,
  });
  return items;
}
