import { describe, expect, it, vi } from 'vitest';

vi.mock('next/og', () => ({ ImageResponse: class {} }));

import { alt, contentType, size } from '@/app/opengraph-image';

describe('opengraph-image', () => {
  it('declares its metadata', () => {
    expect(alt).toBe('Shipment Tracker — track every shipment, regardless of carrier');
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
  });
});
