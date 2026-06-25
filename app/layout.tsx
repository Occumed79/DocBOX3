import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Source Vault',
  description: 'General file sharing, document storage, and plain-English search vault',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="vault-bg" />
        <div className="vault-ambient" />
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="glow-orb orb-blue w-80 h-80 -top-20 -left-20 animate-glow" />
          <div className="glow-orb orb-cyan w-64 h-64 top-20 right-0 animate-glow" style={{ animationDelay: '1s' }} />
          <div className="glow-orb orb-violet w-72 h-72 bottom-0 left-10 animate-glow" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
