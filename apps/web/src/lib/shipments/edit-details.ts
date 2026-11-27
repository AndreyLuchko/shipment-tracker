import type { ShipmentSummary, UpdateShipmentInput } from '@shipment-tracker/shared';

export interface DetailsFormValues {
  description: string;
  weightKg: number | null;
}

/** The changed keys only, or `null` when nothing changed. Description compared trimmed; weight by value. */
export function changedDetails(shipment: ShipmentSummary, values: DetailsFormValues): UpdateShipmentInput | null {
  const changes: UpdateShipmentInput = {};
  const description = values.description.trim();
  if (description !== shipment.description) changes.description = description;
  if (values.weightKg !== shipment.weightKg) changes.weightKg = values.weightKg;
  return Object.keys(changes).length === 0 ? null : changes;
}
