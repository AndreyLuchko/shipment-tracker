import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index.js';

describe('APP_NAME', () => {
  it('is defined', () => {
    expect(APP_NAME).toBe('Shipment Tracker');
  });
});
