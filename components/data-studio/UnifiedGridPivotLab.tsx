'use client';

import GridPivotLab from './GridPivotLab';
import SharedGridPivotWorkbench from './SharedGridPivotWorkbench';
import { useDataset } from './DatasetContext';

export default function UnifiedGridPivotLab() {
  const { dataset } = useDataset();
  return dataset ? <SharedGridPivotWorkbench /> : <GridPivotLab />;
}
