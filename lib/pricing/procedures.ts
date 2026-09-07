export type ProcedureDefinition = {
  code: string;
  codeSystem: 'CPT' | 'CDT' | 'HCPCS';
  name: string;
  category: string;
  aliases: string[];
};

export const PROCEDURES: ProcedureDefinition[] = [
  {
    code: 'D0150',
    codeSystem: 'CDT',
    name: 'Comprehensive Oral Evaluation',
    category: 'Dental',
    aliases: ['comprehensive dental evaluation', 'comprehensive exam', 'dental evaluation', 'dental exam'],
  },
  {
    code: 'D0180',
    codeSystem: 'CDT',
    name: 'Comprehensive Periodontal Evaluation',
    category: 'Dental',
    aliases: ['periodontal evaluation', 'perio evaluation', 'comprehensive perio exam'],
  },
  {
    code: 'D0210',
    codeSystem: 'CDT',
    name: 'Intraoral Complete Series of Radiographic Images',
    category: 'Dental',
    aliases: ['full mouth series', 'fmx', 'full mouth x-rays', 'complete dental x-rays'],
  },
  {
    code: 'D0274',
    codeSystem: 'CDT',
    name: 'Bitewings — Four Radiographic Images',
    category: 'Dental',
    aliases: ['bitewings', 'four bitewings', '4 bitewings', 'bw x-rays'],
  },
  {
    code: 'D0330',
    codeSystem: 'CDT',
    name: 'Panoramic Radiographic Image',
    category: 'Dental',
    aliases: ['pano', 'panorex', 'panoramic x-ray', 'panoramic dental x-ray', 'panoramic radiograph'],
  },
  {
    code: '71046',
    codeSystem: 'CPT',
    name: 'Chest Radiograph, 2 Views',
    category: 'Imaging',
    aliases: ['chest x-ray 2 view', '2 view chest x-ray', 'cxr', 'chest xray'],
  },
  {
    code: '93000',
    codeSystem: 'CPT',
    name: 'Electrocardiogram, Complete',
    category: 'Cardiology',
    aliases: ['ekg', 'ecg', '12 lead ekg', 'electrocardiogram'],
  },
  {
    code: '93015',
    codeSystem: 'CPT',
    name: 'Cardiovascular Stress Test — Complete',
    category: 'Cardiology',
    aliases: ['treadmill stress test', 'exercise stress test', 'cardiac stress test', 'treadmill ekg'],
  },
  {
    code: '94010',
    codeSystem: 'CPT',
    name: 'Spirometry',
    category: 'Pulmonary',
    aliases: ['pft', 'spirometry', 'pulmonary function test'],
  },
  {
    code: '92557',
    codeSystem: 'CPT',
    name: 'Comprehensive Audiometry Threshold Evaluation',
    category: 'Audiology',
    aliases: ['audiogram', 'hearing test', 'pure tone audiometry'],
  },
];

export function inferCodeSystem(code: string): ProcedureDefinition['codeSystem'] | null {
  const normalized = code.trim().toUpperCase();
  if (/^D\d{4}$/.test(normalized)) return 'CDT';
  if (/^\d{5}$/.test(normalized) || /^\d{4}[FT]$/.test(normalized)) return 'CPT';
  if (/^[A-CE-Z]\d{4}$/.test(normalized)) return 'HCPCS';
  return null;
}

export function procedureFromCode(code: string): ProcedureDefinition | null {
  const normalized = code.trim().toUpperCase();
  const known = PROCEDURES.find((procedure) => procedure.code.toUpperCase() === normalized);
  if (known) return known;
  const codeSystem = inferCodeSystem(normalized);
  if (!codeSystem) return null;
  return {
    code: normalized,
    codeSystem,
    name: `${codeSystem} ${normalized}`,
    category: 'Code lookup',
    aliases: [],
  };
}

export function searchProcedures(query: string): ProcedureDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return PROCEDURES;
  const matches = PROCEDURES.filter((procedure) => {
    const haystack = [procedure.code, procedure.codeSystem, procedure.name, procedure.category, ...procedure.aliases]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });

  if (matches.length) return matches;

  // Let users search any syntactically valid CPT/CDT/HCPCS code without requiring a
  // bundled proprietary code-description catalog. Upstream sources supply the pricing.
  const custom = procedureFromCode(query);
  return custom ? [custom] : [];
}
