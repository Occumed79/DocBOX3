'use client';

import SpatialVisualLab from './SpatialVisualLab';
import SharedSpatialWorkbench from './SharedSpatialWorkbench';
import { useDataset } from './DatasetContext';

export default function UnifiedSpatialLab() {
  const { dataset } = useDataset();
  return dataset ? <SharedSpatialWorkbench /> : <SpatialVisualLab />;
}
