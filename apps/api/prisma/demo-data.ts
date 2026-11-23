// apps/api/prisma/demo-data.ts
// The pure demo data set (no I/O, no Prisma): 30 shipments with full movement histories. The seed writes it.
import type { MovementEventSource, ShipmentStatus } from '@shipment-tracker/shared';

export const DEMO_CLIENT_EMAIL = 'client@demo.dev';

export interface DemoClient {
  email: string;
  name: string;
}

/** The clients besides the demo client — nobody can log in as them. */
export const DEMO_EXTRA_CLIENTS: readonly DemoClient[] = [
  { name: 'Kyiv Coffee Roasters', email: 'kyiv.coffee@demo.dev' },
  { name: 'Lviv Print House', email: 'lviv.print@demo.dev' },
  { name: 'Odesa Marine Supply', email: 'odesa.marine@demo.dev' },
];

export interface DemoEvent {
  status: ShipmentStatus;
  source: MovementEventSource;
  occurredAt: Date;
  location?: string;
  note?: string;
}

export interface DemoShipment {
  trackingNumber: string;
  clientEmail: string;
  origin: string;
  destination: string;
  description: string;
  weightKg: number | null;
  /** Oldest first; the first is `CREATED` from `SYSTEM`; the last one's status is the shipment's status. */
  events: DemoEvent[];
}

const HOUR_MS = 60 * 60 * 1000;
const KYIV = DEMO_EXTRA_CLIENTS[0]!.email;
const LVIV = DEMO_EXTRA_CLIENTS[1]!.email;
const ODESA = DEMO_EXTRA_CLIENTS[2]!.email;

/** The moment `hoursAgo` hours before `now`. */
function at(now: Date, hoursAgo: number): Date {
  return new Date(now.getTime() - hoursAgo * HOUR_MS);
}

/** One movement after creation: hours since the shipment was created, plus the optional extras. */
interface Step {
  status: ShipmentStatus;
  afterHours: number;
  location: string;
  note?: string;
  manual?: boolean;
}

function step(
  status: ShipmentStatus,
  afterHours: number,
  location: string,
  extra: { note?: string; manual?: boolean } = {},
): Step {
  return { status, afterHours, location, ...extra };
}

interface Spec {
  clientEmail: string;
  origin: string;
  destination: string;
  description: string;
  weightKg: number | null;
  /** Hours before `now` that the shipment was created. */
  createdHoursAgo: number;
  steps: Step[];
}

// Shipment N is created `715 - (N - 1) * 24.5` hours ago, so the numbers run oldest to newest.
const SPECS: readonly Spec[] = [
  // 1 — the long showcase timeline: self-loop, two warehouse stops, an exception and a recovery.
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kyiv, UA',
    destination: 'Uzhhorod, UA',
    description: 'Pallet of packaged electronics',
    weightKg: 120.5,
    createdHoursAgo: 715,
    steps: [
      step('PICKED_UP', 4, 'Kyiv depot'),
      step('IN_TRANSIT', 20, 'Kyiv sorting hub'),
      step('IN_TRANSIT', 31, 'Rivne transit point'),
      step('AT_WAREHOUSE', 44, 'Lviv warehouse'),
      step('IN_TRANSIT', 58, 'Lviv sorting hub'),
      step('AT_WAREHOUSE', 71, 'Mukachevo warehouse'),
      step('IN_TRANSIT', 80, 'Mukachevo sorting hub'),
      step('OUT_FOR_DELIVERY', 92, 'Uzhhorod depot'),
      step('EXCEPTION', 96, 'Uzhhorod, UA', { note: 'Recipient not available', manual: true }),
      step('OUT_FOR_DELIVERY', 118, 'Uzhhorod depot'),
      step('DELIVERED', 122, 'Uzhhorod, UA'),
    ],
  },
  // 2
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Dnipro, UA',
    description: 'Sacks of roasted coffee beans, 20 x 5 kg',
    weightKg: 100,
    createdHoursAgo: 690.5,
    steps: [
      step('PICKED_UP', 3, 'Kyiv depot'),
      step('IN_TRANSIT', 15, 'Poltava sorting hub'),
      step('OUT_FOR_DELIVERY', 40, 'Dnipro depot'),
      step('DELIVERED', 45, 'Dnipro, UA'),
    ],
  },
  // 3 — recovery after an exception.
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Odesa, UA',
    description: 'Boxes of printed catalogues',
    weightKg: 64.2,
    createdHoursAgo: 666,
    steps: [
      step('PICKED_UP', 5, 'Lviv depot'),
      step('IN_TRANSIT', 18, 'Vinnytsia sorting hub'),
      step('EXCEPTION', 36, 'Vinnytsia sorting hub', { note: 'Damaged packaging reported at the hub' }),
      step('IN_TRANSIT', 60, 'Vinnytsia sorting hub', { manual: true }),
      step('OUT_FOR_DELIVERY', 84, 'Odesa depot'),
      step('DELIVERED', 90, 'Odesa, UA'),
    ],
  },
  // 4
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Odesa, UA',
    destination: 'Kharkiv, UA',
    description: 'Box of spare machine parts',
    weightKg: 8.2,
    createdHoursAgo: 641.5,
    steps: [step('PICKED_UP', 3, 'Odesa depot'), step('IN_TRANSIT', 26, 'Dnipro sorting hub')],
  },
  // 5
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Kherson, UA',
    description: 'Marine rope and mooring fittings',
    weightKg: 240,
    createdHoursAgo: 617,
    steps: [
      step('PICKED_UP', 6, 'Odesa port depot'),
      step('IN_TRANSIT', 14, 'Mykolaiv sorting hub'),
      step('OUT_FOR_DELIVERY', 30, 'Kherson depot'),
      step('DELIVERED', 34, 'Kherson, UA'),
    ],
  },
  // 6
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kyiv, UA',
    destination: 'Chernihiv, UA',
    description: 'Office chairs, 6 pieces',
    weightKg: 72,
    createdHoursAgo: 592.5,
    steps: [
      step('PICKED_UP', 2, 'Kyiv depot'),
      step('IN_TRANSIT', 9, 'Kyiv sorting hub'),
      step('OUT_FOR_DELIVERY', 20, 'Chernihiv depot'),
      step('DELIVERED', 25, 'Chernihiv, UA'),
    ],
  },
  // 7 — currently on hold at customs.
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Uzhhorod, UA',
    description: 'Espresso machine parts',
    weightKg: 35.5,
    createdHoursAgo: 568,
    steps: [
      step('PICKED_UP', 4, 'Kyiv depot'),
      step('IN_TRANSIT', 22, 'Lviv sorting hub'),
      step('EXCEPTION', 50, 'Uzhhorod customs point', { note: 'Customs hold: missing invoice' }),
    ],
  },
  // 8
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Ivano-Frankivsk, UA',
    description: 'Paper rolls for a printing press',
    weightKg: 480,
    createdHoursAgo: 543.5,
    steps: [
      step('PICKED_UP', 3, 'Lviv depot'),
      step('IN_TRANSIT', 8, 'Lviv sorting hub'),
      step('OUT_FOR_DELIVERY', 17, 'Ivano-Frankivsk depot'),
      step('DELIVERED', 21, 'Ivano-Frankivsk, UA'),
    ],
  },
  // 9
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Dnipro, UA',
    destination: 'Zaporizhzhia, UA',
    description: 'Industrial bearings, crate of 40',
    weightKg: 96.8,
    createdHoursAgo: 519,
    steps: [
      step('PICKED_UP', 5, 'Dnipro depot'),
      step('IN_TRANSIT', 12, 'Dnipro sorting hub'),
      step('AT_WAREHOUSE', 29, 'Zaporizhzhia warehouse'),
    ],
  },
  // 10
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Kyiv, UA',
    description: 'Navigation equipment for a yacht',
    weightKg: 18.4,
    createdHoursAgo: 494.5,
    steps: [
      step('PICKED_UP', 2, 'Odesa port depot'),
      step('IN_TRANSIT', 11, 'Vinnytsia sorting hub'),
      step('OUT_FOR_DELIVERY', 24, 'Kyiv depot'),
      step('DELIVERED', 28, 'Kyiv, UA'),
    ],
  },
  // 11
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Kharkiv, UA',
    description: 'Cafe starter kit: grinder and brewing gear',
    weightKg: 27,
    createdHoursAgo: 470,
    steps: [step('PICKED_UP', 3, 'Kyiv depot'), step('IN_TRANSIT', 19, 'Poltava sorting hub')],
  },
  // 12 — currently in exception.
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kharkiv, UA',
    destination: 'Kyiv, UA',
    description: 'Laboratory glassware, fragile',
    weightKg: 14.6,
    createdHoursAgo: 445.5,
    steps: [
      step('PICKED_UP', 4, 'Kharkiv depot'),
      step('IN_TRANSIT', 16, 'Poltava sorting hub'),
      step('EXCEPTION', 38, 'Kyiv sorting hub', { note: 'Damaged packaging reported at the hub', manual: true }),
    ],
  },
  // 13
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Kyiv, UA',
    description: 'Business cards and brochures, 12 cartons',
    weightKg: 55,
    createdHoursAgo: 421,
    steps: [
      step('PICKED_UP', 3, 'Lviv depot'),
      step('IN_TRANSIT', 10, 'Lviv sorting hub'),
      step('AT_WAREHOUSE', 24, 'Kyiv warehouse'),
    ],
  },
  // 14
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Poltava, UA',
    destination: 'Lviv, UA',
    description: 'Hand-made ceramics, 3 boxes',
    weightKg: 31.3,
    createdHoursAgo: 396.5,
    steps: [
      step('PICKED_UP', 6, 'Poltava depot'),
      step('IN_TRANSIT', 20, 'Kyiv sorting hub'),
      step('AT_WAREHOUSE', 38, 'Lviv warehouse'),
      step('OUT_FOR_DELIVERY', 52, 'Lviv depot'),
      step('DELIVERED', 57, 'Lviv, UA', { manual: true }),
    ],
  },
  // 15
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Mykolaiv, UA',
    description: 'Anchor chain, 50 m',
    weightKg: 310,
    createdHoursAgo: 372,
    steps: [step('PICKED_UP', 4, 'Odesa port depot'), step('IN_TRANSIT', 9, 'Odesa sorting hub')],
  },
  // 16
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kyiv, UA',
    destination: 'Vinnytsia, UA',
    description: 'Monitors and docking stations, 8 sets',
    weightKg: 46.9,
    createdHoursAgo: 347.5,
    steps: [
      step('PICKED_UP', 3, 'Kyiv depot'),
      step('IN_TRANSIT', 12, 'Kyiv sorting hub'),
      step('OUT_FOR_DELIVERY', 30, 'Vinnytsia depot'),
    ],
  },
  // 17
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Ternopil, UA',
    description: 'Posters and flyers for an exhibition',
    weightKg: 12.5,
    createdHoursAgo: 323,
    steps: [step('PICKED_UP', 5, 'Lviv depot')],
  },
  // 18
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Zaporizhzhia, UA',
    destination: 'Odesa, UA',
    description: 'Car brake discs, crate of 24',
    weightKg: 150,
    createdHoursAgo: 298.5,
    steps: [
      step('PICKED_UP', 4, 'Zaporizhzhia depot'),
      step('IN_TRANSIT', 15, 'Dnipro sorting hub'),
      step('IN_TRANSIT', 33, 'Mykolaiv transit point'),
    ],
  },
  // 19
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Lviv, UA',
    description: 'Green coffee, 10 sacks',
    weightKg: 600,
    createdHoursAgo: 274,
    steps: [
      step('PICKED_UP', 3, 'Kyiv depot'),
      step('IN_TRANSIT', 14, 'Kyiv sorting hub'),
      step('AT_WAREHOUSE', 30, 'Lviv warehouse'),
    ],
  },
  // 20
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Kyiv, UA',
    description: 'Fishing nets and floats',
    weightKg: 88,
    createdHoursAgo: 249.5,
    steps: [
      step('PICKED_UP', 2, 'Odesa port depot'),
      step('IN_TRANSIT', 10, 'Vinnytsia sorting hub'),
      step('OUT_FOR_DELIVERY', 26, 'Kyiv depot'),
    ],
  },
  // 21
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Chernihiv, UA',
    description: 'Gift boxes of single-origin coffee',
    weightKg: null,
    createdHoursAgo: 225,
    steps: [step('PICKED_UP', 3, 'Kyiv depot')],
  },
  // 22 — currently in exception.
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Kharkiv, UA',
    description: 'Offset printing plates',
    weightKg: 42,
    createdHoursAgo: 200.5,
    steps: [
      step('PICKED_UP', 4, 'Lviv depot'),
      step('IN_TRANSIT', 13, 'Lviv sorting hub'),
      step('EXCEPTION', 30, 'Kharkiv depot', { note: 'Recipient not available', manual: true }),
    ],
  },
  // 23
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Dnipro, UA',
    description: 'Deck hardware: cleats, shackles, blocks',
    weightKg: 57.3,
    createdHoursAgo: 176,
    steps: [step('PICKED_UP', 3, 'Odesa port depot'), step('IN_TRANSIT', 17, 'Odesa sorting hub')],
  },
  // 24
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Odesa, UA',
    description: 'Labels and packaging film, 6 rolls',
    weightKg: 74,
    createdHoursAgo: 151.5,
    steps: [
      step('PICKED_UP', 3, 'Lviv depot'),
      step('IN_TRANSIT', 11, 'Lviv sorting hub'),
      step('AT_WAREHOUSE', 27, 'Vinnytsia warehouse'),
    ],
  },
  // 25
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Dnipro, UA',
    description: 'Coffee roaster spare parts',
    weightKg: 19.9,
    createdHoursAgo: 127,
    steps: [
      step('PICKED_UP', 2, 'Kyiv depot'),
      step('IN_TRANSIT', 9, 'Kyiv sorting hub'),
      step('OUT_FOR_DELIVERY', 40, 'Dnipro depot'),
    ],
  },
  // 26
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kyiv, UA',
    destination: 'Ivano-Frankivsk, UA',
    description: 'Warehouse shelving kit',
    weightKg: 210,
    createdHoursAgo: 102.5,
    steps: [step('PICKED_UP', 4, 'Kyiv depot', { manual: true })],
  },
  // 27
  {
    clientEmail: LVIV,
    origin: 'Lviv, UA',
    destination: 'Zaporizhzhia, UA',
    description: 'Printer toner cartridges, 40 pieces',
    weightKg: 38.5,
    createdHoursAgo: 78,
    steps: [step('PICKED_UP', 3, 'Lviv depot'), step('IN_TRANSIT', 10, 'Lviv sorting hub')],
  },
  // 28
  {
    clientEmail: ODESA,
    origin: 'Odesa, UA',
    destination: 'Poltava, UA',
    description: 'Life jackets, 25 pieces',
    weightKg: 33,
    createdHoursAgo: 53.5,
    steps: [],
  },
  // 29 — only created; an extra client's.
  {
    clientEmail: KYIV,
    origin: 'Kyiv, UA',
    destination: 'Vinnytsia, UA',
    description: 'Coffee grinder, one piece',
    weightKg: 6.4,
    createdHoursAgo: 29,
    steps: [],
  },
  // 30 — the newest, only created.
  {
    clientEmail: DEMO_CLIENT_EMAIL,
    origin: 'Kharkiv, UA',
    destination: 'Kyiv, UA',
    description: 'Documents folder and sample set',
    weightKg: null,
    createdHoursAgo: 4.5,
    steps: [],
  },
];

/** The 30 demo shipments, every time relative to `now`. Pure: the same `now` gives a deep-equal result. */
export function buildDemoShipments(now: Date): DemoShipment[] {
  return SPECS.map((spec, index) => {
    const { createdHoursAgo, steps, ...shipment } = spec;
    const events: DemoEvent[] = [{ status: 'CREATED', source: 'SYSTEM', occurredAt: at(now, createdHoursAgo) }];
    for (const next of steps) {
      events.push({
        status: next.status,
        source: next.manual ? 'MANUAL' : 'WEBHOOK',
        occurredAt: at(now, createdHoursAgo - next.afterHours),
        location: next.location,
        ...(next.note !== undefined && { note: next.note }),
      });
    }
    return { trackingNumber: `ST-2026-${String(index + 1).padStart(6, '0')}`, ...shipment, events };
  });
}
