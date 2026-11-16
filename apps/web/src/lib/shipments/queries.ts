import type {
  CreateShipmentEventInput,
  CreateShipmentInput,
  ListShipmentsQuery,
  ShipmentDetail,
  ShipmentListResponse,
  UserSummary,
} from '@shipment-tracker/shared';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { addShipmentEvent, createShipment, fetchShipment, fetchShipments } from '@/lib/api/shipments';
import { fetchClients } from '@/lib/api/users';

export const shipmentKeys = {
  lists: () => ['shipments', 'list'] as const,
  list: (query: ListShipmentsQuery) => ['shipments', 'list', query] as const,
  detail: (id: string) => ['shipments', 'detail', id] as const,
};

export const clientKeys = { all: ['users', 'clients'] as const };

/** One page of the list. While another page or filter loads, the previous one stays as placeholder data. */
export function useShipmentsQuery(query: ListShipmentsQuery): UseQueryResult<ShipmentListResponse> {
  return useQuery({
    queryKey: shipmentKeys.list(query),
    queryFn: () => fetchShipments(query),
    placeholderData: keepPreviousData,
  });
}

export function useShipmentQuery(id: string): UseQueryResult<ShipmentDetail> {
  return useQuery({ queryKey: shipmentKeys.detail(id), queryFn: () => fetchShipment(id) });
}

export function useClientsQuery(): UseQueryResult<UserSummary[]> {
  return useQuery({ queryKey: clientKeys.all, queryFn: fetchClients });
}

/** On success: the new shipment becomes the detail cache entry and every list is invalidated. */
export function useCreateShipment(): UseMutationResult<ShipmentDetail, Error, CreateShipmentInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createShipment,
    onSuccess: (shipment) => {
      queryClient.setQueryData(shipmentKeys.detail(shipment.id), shipment);
      return queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
    },
  });
}

/**
 * On success: the returned shipment replaces the detail cache entry and every list is invalidated.
 * On `INVALID_STATUS_TRANSITION`: the detail is invalidated — what the form showed was stale.
 */
export function useAddShipmentEvent(id: string): UseMutationResult<ShipmentDetail, Error, CreateShipmentEventInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShipmentEventInput) => addShipmentEvent(id, input),
    onSuccess: (shipment) => {
      queryClient.setQueryData(shipmentKeys.detail(id), shipment);
      return queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVALID_STATUS_TRANSITION') {
        return queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(id) });
      }
      return undefined;
    },
  });
}
