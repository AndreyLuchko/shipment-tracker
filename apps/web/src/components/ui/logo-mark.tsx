import { useId, type ReactNode } from 'react';

/** The mark's coordinate space: the pixels of `docs/brand/logo-reference.png`, cropped to the drawing (≈ 4:3). */
export const LOGO_MARK_VIEW_BOX = '250 100 940 720';

/**
 * The drawing inside the mark's `<svg>`: motion lines, a route arc with three stops, an isometric parcel and a
 * location pin above it. `id` prefixes the gradient and clip-path ids, so it must be unique in the document and
 * contain only `[A-Za-z0-9_-]`. A plain function without hooks, so `next/og` can call it too.
 */
export function LogoMarkArt({ id }: { id: string }): ReactNode {
  const ref = (name: string): string => `url(#${id}-${name})`;

  return (
    <g>
      <defs>
        <linearGradient id={`${id}-line`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d6eafd" />
          <stop offset="0.45" stopColor="#5ca0fd" />
          <stop offset="1" stopColor="#0552ea" />
        </linearGradient>
        <linearGradient id={`${id}-arc-in`} gradientUnits="userSpaceOnUse" x1="905" y1="0" x2="1104" y2="0">
          <stop offset="0" stopColor="#dfe4f3" />
          <stop offset="1" stopColor="#8fa0cd" />
        </linearGradient>
        <linearGradient id={`${id}-arc`} gradientUnits="userSpaceOnUse" x1="0" y1="349" x2="0" y2="786">
          <stop offset="0" stopColor="#8fa0cd" />
          <stop offset="1" stopColor="#7a8cbd" />
        </linearGradient>
        <linearGradient id={`${id}-arc-out`} gradientUnits="userSpaceOnUse" x1="570" y1="0" x2="410" y2="0">
          <stop offset="0" stopColor="#8495c4" />
          <stop offset="1" stopColor="#eef2fb" />
        </linearGradient>
        <linearGradient id={`${id}-top`} gradientUnits="userSpaceOnUse" x1="560" y1="458" x2="680" y2="458">
          <stop offset="0" stopColor="#feae36" />
          <stop offset="0.35" stopColor="#fec862" />
          <stop offset="1" stopColor="#fecd68" />
        </linearGradient>
        <linearGradient id={`${id}-left`} gradientUnits="userSpaceOnUse" x1="580" y1="470" x2="760" y2="730">
          <stop offset="0" stopColor="#ffab33" />
          <stop offset="0.6" stopColor="#fe9f2a" />
          <stop offset="1" stopColor="#fd8819" />
        </linearGradient>
        <linearGradient id={`${id}-right`} gradientUnits="userSpaceOnUse" x1="975" y1="470" x2="780" y2="730">
          <stop offset="0" stopColor="#fd861c" />
          <stop offset="0.5" stopColor="#ea6d15" />
          <stop offset="1" stopColor="#c6520f" />
        </linearGradient>
        <linearGradient id={`${id}-tape`} gradientUnits="userSpaceOnUse" x1="700" y1="400" x2="908" y2="500">
          <stop offset="0" stopColor="#2a4682" />
          <stop offset="1" stopColor="#1a3364" />
        </linearGradient>
        <linearGradient id={`${id}-pin`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1680ff" />
          <stop offset="0.55" stopColor="#0a55e6" />
          <stop offset="1" stopColor="#0134c6" />
        </linearGradient>
        <linearGradient id={`${id}-dot`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b5cd8" />
          <stop offset="1" stopColor="#0238bd" />
        </linearGradient>
        <clipPath id={`${id}-box`}>
          <path d="M755 386.5Q770 381 785 386.5L965 452.5Q980 458 980 474L980 624Q980 640 965.5 646.8L784.5 731.2Q770 738 755 732.4L575 665.6Q560 660 560 644L560 474Q560 458 575 452.5Z" />
        </clipPath>
      </defs>
      <g fill={ref('line')}>
        <rect x="353" y="468" width="182" height="40" rx="20" />
        <rect x="268" y="540" width="267" height="40" rx="20" />
        <rect x="343" y="607" width="192" height="39" rx="19.5" />
      </g>
      <path
        fill="none"
        stroke={ref('arc-in')}
        strokeWidth="20"
        strokeLinecap="round"
        d="M905 292C990 293 1060 315 1104 349"
      />
      <path
        fill="none"
        stroke={ref('arc')}
        strokeWidth="20"
        d="M1104 349C1150 385 1172 430 1170 470C1168 520 1140 560 1100 597C1020 670 860 750 700 778C650 786 610 786 570 784"
      />
      <path fill={ref('arc-out')} d="M570 774L570 794C485 792 420 760 406 700C440 742 495 772 570 774Z" />
      <g clipPath={ref('box')}>
        <path fill={ref('left')} d="M560 458 770 535V738L560 660Z" />
        <path fill={ref('right')} d="M770 535 980 458V640L770 738Z" />
        <path fill={ref('top')} d="M770 381 980 458 770 535 560 458Z" />
        <path fill={ref('tape')} d="M640 417 700 393 908 484 850 505Z" />
        <path fill="#082049" d="M850 505 908 484V535Q908 545 898.7 548.7L859.3 564.3Q850 568 850 558Z" />
      </g>
      <path
        fill="none"
        stroke="#b54c07"
        strokeOpacity="0.9"
        strokeWidth="20"
        strokeLinecap="round"
        d="M597 557 666 589M594 592 650 618"
      />
      <path
        fill={ref('pin')}
        fillRule="evenodd"
        d="M756 390C728 358 647 300 647 233A121 121 0 1 1 889 233C889 300 808 358 780 390Q768 404 756 390ZM820 228A52 52 0 1 0 716 228A52 52 0 1 0 820 228Z"
      />
      <g fill={ref('dot')}>
        <circle cx="1104" cy="349" r="39" />
        <circle cx="1100" cy="597" r="39" />
        <circle cx="570" cy="772" r="42" />
      </g>
      <g fill="#ffffff">
        <circle cx="1104" cy="349" r="19" />
        <circle cx="1100" cy="597" r="20" />
        <circle cx="570" cy="772" r="22" />
      </g>
    </g>
  );
}

/**
 * The brand mark from `docs/brand/logo-reference.png`, redrawn flat on a transparent background with fixed colours,
 * so it reads on both the light and the dark surface. Decorative — the page names the app elsewhere. Size it with
 * `className` (e.g. `h-8 w-auto`; the aspect is 940:720). The favicon (`src/app/icon.svg`) is a separate,
 * simplified 32×32 drawing; `src/app/opengraph-image.tsx` reuses `LogoMarkArt`.
 */
export function LogoMark({ className }: { className?: string }): ReactNode {
  const id = `logo-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  return (
    <svg aria-hidden="true" focusable="false" viewBox={LOGO_MARK_VIEW_BOX} className={className}>
      <LogoMarkArt id={id} />
    </svg>
  );
}
