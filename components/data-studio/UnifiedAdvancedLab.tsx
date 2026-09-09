'use client';

import AdvancedVisualLab from './AdvancedVisualLab';
import SharedAdvancedWorkbench from './SharedAdvancedWorkbench';
import { useDataset } from './DatasetContext';

export default function UnifiedAdvancedLab() {
  const { dataset } = useDataset();
  return dataset ? <SharedAdvancedWorkbench /> : <AdvancedVisualLab />;
}
