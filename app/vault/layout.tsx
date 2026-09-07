import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Price Intelligence | Occu-Med',
  description: 'Self-pay healthcare price intelligence, geographic market exploration, quote comparison, and evidence-based pricing reports.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e9f1f8',
  colorScheme: 'light',
};

export default function VaultLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
