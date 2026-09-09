'use client';

import { usePathname } from 'next/navigation';
import { useDataset } from './DatasetContext';
import DataStudioPowerTools from './DataStudioPowerTools';

export default function DataStudioPowerToolsGate() {
  const pathname = usePathname();
  const { dataset } = useDataset();
  if (!dataset || !pathname.startsWith('/vault/studio')) return null;
  return <DataStudioPowerTools />;
}
