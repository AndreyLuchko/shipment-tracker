'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createShipmentEventSchema, SHIPMENT_STATUSES, type ShipmentDetail } from '@shipment-tracker/shared';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { SelectField } from '@/components/ui/select-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api/client';
import { applyApiError } from '@/lib/form-errors';
import { useAddShipmentEvent } from '@/lib/shipments/queries';
import { STATUS_LABELS } from '@/lib/shipments/status';

/** The dispatcher's manual status update for one shipment. */
export function StatusUpdateForm({ shipment }: { shipment: ShipmentDetail }): ReactNode {
  const allowed = shipment.allowedNextStatuses;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Add status update</h2>
      {allowed.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          This shipment has reached its final status. No further updates can be added.
        </p>
      ) : (
        <UpdateForm shipment={shipment} />
      )}
    </section>
  );
}

function UpdateForm({ shipment }: { shipment: ShipmentDetail }): ReactNode {
  const { mutateAsync } = useAddShipmentEvent(shipment.id);
  const [added, setAdded] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createShipmentEventSchema), defaultValues: { location: '', note: '' } });

  const submit = handleSubmit(async (values) => {
    try {
      await mutateAsync(values);
      reset();
      setAdded(true);
    } catch (error) {
      applyApiError(error, setError, ['status', 'location', 'note']);
      // The options are about to change (the detail was invalidated); the stale choice must not be resent (C24).
      if (error instanceof ApiError && error.code === 'INVALID_STATUS_TRANSITION') resetField('status');
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        setAdded(false);
        void submit(event);
      }}
      className="mt-4 space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="New status" error={errors.status?.message} {...register('status')}>
          <option value="">Select a status</option>
          {SHIPMENT_STATUSES.map((status) => (
            <option key={status} value={status} disabled={!shipment.allowedNextStatuses.includes(status)}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </SelectField>
        <TextField label="Location" error={errors.location?.message} {...register('location')} />
      </div>
      <TextareaField label="Note" rows={3} error={errors.note?.message} {...register('note')} />
      <FormAlert message={errors.root?.server?.message} />
      <Button type="submit" loading={isSubmitting}>
        Add update
      </Button>
      {added && (
        <p role="status" className="text-sm text-emerald-700">
          Update added.
        </p>
      )}
    </form>
  );
}
