'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createShipmentSchema, type ShipmentDetail } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { applyApiError } from '@/lib/form-errors';
import { changedDetails } from '@/lib/shipments/edit-details';
import { useUpdateShipment } from '@/lib/shipments/queries';

/** The create form's messages; an empty weight is `null` (it clears the weight). */
const detailsFormSchema = z.object({
  description: createShipmentSchema.shape.description,
  weightKg: createShipmentSchema.shape.weightKg.unwrap().nullable(),
});

/** The dispatcher's form for a shipment's description and weight; only real changes are sent. */
export function EditShipmentForm({
  shipment,
  onClose,
}: {
  shipment: ShipmentDetail;
  onClose: (saved: boolean) => void;
}): ReactNode {
  const { mutateAsync } = useUpdateShipment(shipment.id);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(detailsFormSchema),
    defaultValues: { description: shipment.description, weightKg: shipment.weightKg },
  });
  const [description = '', weightKg = null] = useWatch({ control, name: ['description', 'weightKg'] });
  const unchanged = changedDetails(shipment, { description, weightKg }) === null;

  const submit = handleSubmit(async (values) => {
    const changes = changedDetails(shipment, values);
    if (changes === null) return;
    try {
      await mutateAsync(changes);
      onClose(true);
    } catch (error) {
      applyApiError(error, setError, ['description', 'weightKg']);
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <TextField label="Description" error={errors.description?.message} {...register('description')} />
      <TextField
        label="Weight (kg)"
        type="number"
        step="0.1"
        inputMode="decimal"
        error={errors.weightKg?.message}
        {...register('weightKg', { setValueAs: (value) => (value === '' ? null : Number(value)) })}
      />
      <FormAlert message={errors.root?.server?.message} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={isSubmitting} disabled={unchanged}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => onClose(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
