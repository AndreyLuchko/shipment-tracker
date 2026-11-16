'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createShipmentSchema } from '@shipment-tracker/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { ClientPicker } from '@/components/shipments/client-picker';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { applyApiError } from '@/lib/form-errors';
import { SHIPMENTS_PATH } from '@/lib/shipments/list-params';
import { useClientsQuery, useCreateShipment } from '@/lib/shipments/queries';

/** An empty number box means "no weight" — never `0` or `NaN` (the key is then omitted from the body). */
const toOptionalNumber = (value: unknown): number | undefined =>
  value === '' || value == null ? undefined : Number(value);

/** The dispatcher's form for a new shipment; on success it opens the shipment's detail. */
export function NewShipmentForm(): ReactNode {
  const router = useRouter();
  const { mutateAsync } = useCreateShipment();
  // The picker's cache entry: reading it here costs no request (C25).
  const hasClients = (useClientsQuery().data?.length ?? 0) > 0;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createShipmentSchema),
    defaultValues: { clientId: '', origin: '', destination: '', description: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const shipment = await mutateAsync(values);
      router.push(`${SHIPMENTS_PATH}/${shipment.id}`);
    } catch (error) {
      applyApiError(error, setError, ['clientId', 'origin', 'destination', 'description', 'weightKg']);
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <ClientPicker error={errors.clientId?.message} {...register('clientId')} />
      <TextField label="Origin" error={errors.origin?.message} {...register('origin')} />
      <TextField label="Destination" error={errors.destination?.message} {...register('destination')} />
      <TextField label="Description" error={errors.description?.message} {...register('description')} />
      <TextField
        label="Weight (kg)"
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        error={errors.weightKg?.message}
        {...register('weightKg', { setValueAs: toOptionalNumber })}
      />
      <FormAlert message={errors.root?.server?.message} />
      <div className="flex items-center gap-4">
        <Button type="submit" loading={isSubmitting} disabled={!hasClients}>
          Create shipment
        </Button>
        <Link href={SHIPMENTS_PATH} className="text-sm font-medium text-slate-600 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
