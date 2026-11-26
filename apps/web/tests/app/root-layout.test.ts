import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/layout';

describe('root metadata', () => {
  it('keeps the site title and description', () => {
    expect(metadata.title).toBe('Shipment Tracker');
    expect(metadata.description).toBe('Track every shipment, regardless of carrier.');
  });

  it('resolves relative metadata URLs against an absolute origin', () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it('describes the link preview card', () => {
    expect(metadata.openGraph).toEqual({
      type: 'website',
      siteName: 'Shipment Tracker',
      title: 'Shipment Tracker',
      description: 'Track every shipment, regardless of carrier.',
    });
    expect(metadata.twitter).toEqual({ card: 'summary_large_image' });
  });
});
