'use client';

import type { CSSProperties } from 'react';

const SPARKS = [
  [8, 18, 5, -2, 15], [16, 28, 3, -8, 19], [24, 12, 4, -12, 17], [31, 37, 6, -4, 21],
  [39, 22, 3, -16, 16], [47, 48, 5, -7, 23], [55, 30, 4, -11, 18], [63, 58, 6, -1, 20],
  [71, 42, 3, -14, 15], [79, 68, 5, -5, 22], [87, 52, 4, -18, 17], [93, 76, 6, -9, 24],
  [12, 66, 4, -13, 20], [20, 79, 6, -3, 18], [29, 59, 3, -17, 16], [36, 86, 5, -6, 22],
  [45, 70, 4, -10, 19], [53, 88, 6, -2, 23], [61, 74, 3, -15, 17], [69, 91, 5, -8, 21],
  [77, 82, 4, -12, 18], [85, 94, 6, -4, 24], [91, 87, 3, -16, 16], [97, 63, 5, -7, 20],
] as const;

export default function LuminousBackdrop() {
  return (
    <div className="luminous-backdrop" aria-hidden="true">
      <div className="ambient-bloom ambient-bloom-one" />
      <div className="ambient-bloom ambient-bloom-two" />
      <div className="pixel-field pixel-field-top" />
      <div className="pixel-field pixel-field-bottom" />

      <div className="wave-loop wave-loop-back"><WaveSvg id="back" /><WaveSvg id="back-copy" /></div>
      <div className="wave-loop wave-loop-mid"><WaveSvg id="mid" /><WaveSvg id="mid-copy" /></div>
      <div className="wave-loop wave-loop-front"><WaveSvg id="front" /><WaveSvg id="front-copy" /></div>

      <div className="spark-field">
        {SPARKS.map(([top, left, size, delay, duration], index) => (
          <span
            key={index}
            className="traveling-spark"
            style={{
              '--spark-top': `${top}%`,
              '--spark-left': `${left}%`,
              '--spark-size': `${size}px`,
              '--spark-delay': `${delay}s`,
              '--spark-duration': `${duration}s`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="cosmic-grain" />
    </div>
  );
}

function WaveSvg({ id }: { id: string }) {
  return (
    <svg className="wave-svg" viewBox="0 0 1600 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ribbon-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#061827" stopOpacity="0" />
          <stop offset="0.22" stopColor="#0F4C5C" stopOpacity="0.48" />
          <stop offset="0.52" stopColor="#3A8D9A" stopOpacity="0.82" />
          <stop offset="0.78" stopColor="#0B2D3D" stopOpacity="0.6" />
          <stop offset="1" stopColor="#061827" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`thread-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#D7F2F0" stopOpacity="0" />
          <stop offset="0.34" stopColor="#D7F2F0" stopOpacity="0.96" />
          <stop offset="0.62" stopColor="#3A8D9A" stopOpacity="0.92" />
          <stop offset="1" stopColor="#0F4C5C" stopOpacity="0" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="16" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path className="wave-ribbon" d="M-80 590 C 210 420, 395 735, 690 580 S 1155 440, 1680 610" fill="none" stroke={`url(#ribbon-${id})`} strokeWidth="150" strokeLinecap="round" filter={`url(#glow-${id})`} />
      <path className="wave-thread" d="M-60 650 C 230 500, 410 790, 720 625 S 1185 500, 1670 680" fill="none" stroke={`url(#thread-${id})`} strokeWidth="4" strokeLinecap="round" />
      <path className="wave-thread secondary" d="M-80 680 C 205 545, 430 820, 725 660 S 1200 545, 1680 720" fill="none" stroke={`url(#thread-${id})`} strokeWidth="2" strokeLinecap="round" />
      <path className="wave-thread tertiary" d="M-100 710 C 220 590, 445 845, 760 690 S 1210 595, 1700 750" fill="none" stroke={`url(#thread-${id})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
