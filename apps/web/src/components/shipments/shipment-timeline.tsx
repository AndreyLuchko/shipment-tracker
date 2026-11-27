'use client';

import type { ShipmentEvent } from '@shipment-tracker/shared';
import { MotionConfig, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { StatusBadge } from '@/components/shipments/status-badge';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/shipments/status';

/** The movement history, oldest first; the last entry is the shipment's current status. */
export function ShipmentTimeline({ events }: { events: ShipmentEvent[] }): ReactNode {
  // Entries present at the first render appear one after another; one appended later slides in at once.
  const [initialCount] = useState(events.length);

  if (events.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">No movements recorded yet.</p>;
  }

  const lastIndex = events.length - 1;
  return (
    <MotionConfig reducedMotion="user">
      <ol aria-label="Movement timeline" className="mt-4 space-y-6 border-l border-line pl-6">
        {events.map((event, index) => {
          const current = index === lastIndex;
          return (
            <motion.li
              key={event.id}
              aria-current={current ? 'step' : undefined}
              className="relative"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index < initialCount ? index * 0.06 : 0 }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -left-7.25 top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-page',
                  current ? 'bg-indigo-600' : 'bg-line-strong',
                )}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge status={event.status} />
                <time
                  dateTime={event.occurredAt}
                  title={formatDateTime(event.occurredAt)}
                  className="cursor-help text-xs text-ink-subtle underline decoration-dotted underline-offset-2"
                >
                  {formatRelativeTime(event.occurredAt)}
                </time>
                <span className="text-xs text-ink-subtle">{SOURCE_LABELS[event.source]}</span>
              </div>
              {event.location !== null && <p className="mt-1 text-sm text-ink">{event.location}</p>}
              {event.note !== null && <p className="mt-1 text-sm text-ink-muted">{event.note}</p>}
            </motion.li>
          );
        })}
      </ol>
    </MotionConfig>
  );
}
