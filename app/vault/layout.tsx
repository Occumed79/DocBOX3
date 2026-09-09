import type { Metadata, Viewport } from 'next';
import VaultNav from '@/components/data-studio/VaultNav';
import { DatasetProvider } from '@/components/data-studio/DatasetContext';
import SharedDatasetBootstrap from '@/components/data-studio/SharedDatasetBootstrap';
import DataStudioDatasetMirror from '@/components/data-studio/DataStudioDatasetMirror';
import DataStudioPowerToolsGate from '@/components/data-studio/DataStudioPowerToolsGate';
import '../styles/functional-power.css';

export const metadata: Metadata = {
  title: 'DocBOX3 Data Workbench | Occu-Med',
  description: 'Spreadsheet cleanup, interactive data visualization, spatial analysis, and report production for network and operational analysis.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#eef3f8',
  colorScheme: 'light',
};

export default function VaultLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <DatasetProvider>
      <div className="vault-shell">
        <VaultNav />
        <SharedDatasetBootstrap />
        <DataStudioDatasetMirror />
        <DataStudioPowerToolsGate />
        <div className="vault-stage">{children}</div>
      </div>
    </DatasetProvider>
  );
}
