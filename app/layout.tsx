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
import './styles/data-studio-pro.css';
import './styles/advanced-visual-lab.css';
import './styles/storytelling-studio.css';
import './styles/cyber-visual-lab.css';
import './styles/spatial-visual-lab.css';
import './styles/grid-pivot-lab.css';
import './styles/unified-product.css';
import './styles/studio-dashboard.css';

export const metadata: Metadata = {
  title: 'Occu-Med Data Studio',
  description: 'Upload spreadsheets, edit the data schema, build charts, maps and visual tables, apply house styles, annotate findings, and produce designed analyst reports.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
