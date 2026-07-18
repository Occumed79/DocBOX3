import type { Metadata, Viewport } from 'next';
import './globals.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/library.css';
import './styles/inspector.css';
import './styles/overlays.css';
import './styles/responsive.css';

export const metadata: Metadata = {
  title: 'Source Vault',
  description: 'A shared file workspace for uploading, organizing, previewing, searching, and securely sharing documents.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05070d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
