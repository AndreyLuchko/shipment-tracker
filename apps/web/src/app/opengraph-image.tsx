import { ImageResponse } from 'next/og';

export const alt = 'Shipment Tracker — track every shipment, regardless of carrier';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PILLS = [
  { label: 'Created', background: '#e2e8f0', color: '#314158' },
  { label: 'In transit', background: '#e0e7ff', color: '#432dd7' },
  { label: 'Delivered', background: '#d0fae5', color: '#007a55' },
  { label: 'Exception', background: '#e7000b', color: '#ffffff' },
];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 96px',
        background: '#0f172b',
      }}
    >
      <div style={{ display: 'flex', fontSize: 80, fontWeight: 700, color: '#ffffff' }}>Shipment Tracker</div>
      <div style={{ display: 'flex', marginTop: 16, fontSize: 36, color: '#c7d2fe' }}>
        Track every shipment, regardless of carrier.
      </div>
      <div style={{ display: 'flex', marginTop: 56 }}>
        {PILLS.map((pill) => (
          <div
            key={pill.label}
            style={{
              display: 'flex',
              marginRight: 20,
              padding: '10px 28px',
              borderRadius: 9999,
              fontSize: 30,
              background: pill.background,
              color: pill.color,
            }}
          >
            {pill.label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
