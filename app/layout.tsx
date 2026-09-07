import type { Metadata, Viewport } from 'next';
import './globals.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/library.css';
import './styles/inspector.css';
import './styles/overlays.css';
import './styles/responsive.css';
import './styles/stage.css';
import './styles/stage-polish.css';
import './styles/stage-integration.css';
import './styles/gallery.css';
import './styles/abyssal-overlays.css';
import './styles/landing.css';
import './styles/landing-liquid.css';
import './styles/docbox-polish.css';
import './styles/glacial-palette.css';
import './styles/landing-glacial.css';
import './styles/price-intelligence.css';
import './styles/price-results.css';
import './styles/price-report.css';
import './styles/price-intelligence-v2.css';
import './styles/price-experience-lab.css';

export const metadata: Metadata = {
  title: 'Price Intelligence | Occu-Med',
  description: 'Self-pay healthcare price intelligence with geographic market exploration, source provenance, and multiple interactive visualization modes.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07111f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
