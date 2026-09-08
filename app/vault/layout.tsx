import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Data Studio | Occu-Med',
  description: 'Spreadsheet cleanup, interactive data visualization, and report production for network and operational analysis.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function VaultLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
