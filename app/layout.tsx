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
import './styles/glacial-palette.css';

export const metadata: Metadata = {
  title: 'Source Vault',
  description: 'A luminous visual workspace for staging, previewing, organizing, and securely sharing documents.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#415881',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
