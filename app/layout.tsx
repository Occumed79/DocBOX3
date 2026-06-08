import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Source Vault',
  description: 'Universal document storage and plain-English search vault',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="vault-bg" />
        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
