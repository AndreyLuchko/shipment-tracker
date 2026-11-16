'use client';

import type { ComponentProps, ReactNode } from 'react';

import { ErrorState } from '@/components/ui/error-state';
import { SelectField } from '@/components/ui/select-field';
import { useClientsQuery } from '@/lib/shipments/queries';

type ClientPickerProps = Omit<ComponentProps<'select'>, 'children'> & { error?: string };

/** The "Client" select of the new-shipment form, fed by `GET /users?role=CLIENT`. */
export function ClientPicker({ error, ...rest }: ClientPickerProps): ReactNode {
  const clients = useClientsQuery();

  if (clients.isPending) {
    // The caller's props are not applied: a disabled placeholder must not register as the form field.
    return (
      <SelectField label="Client" disabled>
        <option>Loading clients…</option>
      </SelectField>
    );
  }

  if (clients.isError) {
    return (
      <ErrorState
        title="Could not load clients"
        error={clients.error}
        onRetry={() => void clients.refetch()}
        retrying={clients.isFetching}
      />
    );
  }

  if (clients.data.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No clients yet. A client has to register before a shipment can be created for them.
      </p>
    );
  }

  return (
    <SelectField label="Client" error={error} {...rest}>
      <option value="">Select a client</option>
      {clients.data.map((client) => (
        <option key={client.id} value={client.id}>
          {`${client.name} — ${client.email}`}
        </option>
      ))}
    </SelectField>
  );
}
