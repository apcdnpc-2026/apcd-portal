export enum APCDCategory {
  ESP = 'ESP',
  BAG_FILTER = 'BAG_FILTER',
  CYCLONE = 'CYCLONE',
  WET_SCRUBBER = 'WET_SCRUBBER',
  DRY_SCRUBBER = 'DRY_SCRUBBER',
  HYBRID_OTHER = 'HYBRID_OTHER',
  FUME_EXTRACTION = 'FUME_EXTRACTION',
}

export enum APCDInstallationCategory {
  BOILER_FURNACE_TFH = 'BOILER_FURNACE_TFH',
  NON_BOILER_NON_FURNACE = 'NON_BOILER_NON_FURNACE',
  BOTH = 'BOTH',
}

export const APCD_CATEGORY_LABELS: Record<APCDCategory, string> = {
  [APCDCategory.ESP]: 'Electrostatic Precipitators (ESP)',
  [APCDCategory.BAG_FILTER]: 'Bag Filter / Baghouse Systems',
  [APCDCategory.CYCLONE]: 'Cyclones',
  [APCDCategory.WET_SCRUBBER]: 'Wet Scrubbers',
  [APCDCategory.DRY_SCRUBBER]: 'Dry Scrubbers',
  [APCDCategory.HYBRID_OTHER]: 'Hybrid / Other',
  [APCDCategory.FUME_EXTRACTION]: 'Industrial Fume/Dust Extraction',
};

export const INSTALLATION_CATEGORY_LABELS: Record<APCDInstallationCategory, string> = {
  [APCDInstallationCategory.BOILER_FURNACE_TFH]:
    'Category 1: Boilers / Furnaces / Thermic Fluid Heaters (TFH)',
  [APCDInstallationCategory.NON_BOILER_NON_FURNACE]:
    'Category 2: Non-Boiler / Non-Furnace / Non-TFH',
  [APCDInstallationCategory.BOTH]: 'Both Categories',
};

export interface APCDTypeInfo {
  category: APCDCategory;
  subType: string;
}

/** Full APCD taxonomy matching the application form (fields 21-22) */
export const APCD_SUBTYPES: Record<APCDCategory, string[]> = {
  [APCDCategory.ESP]: ['Dry ESP (Plate/Tube Type)', 'Wet ESP'],
  [APCDCategory.BAG_FILTER]: [
    'Pulse Jet Baghouse',
    'Reverse Air Baghouse',
    'Mechanical Shaker Baghouse',
  ],
  [APCDCategory.CYCLONE]: [
    'Single Cyclone',
    'Twin Cyclone',
    'Multi Cyclone / Multi-Clone',
    'High-Efficiency Cyclone',
  ],
  [APCDCategory.WET_SCRUBBER]: [
    'Venturi Scrubber',
    'Spray Tower / Spray Scrubber',
    'Packed Bed Scrubber',
    'Submerged Scrubber',
    'Multi-Stage Wet Scrubber',
  ],
  [APCDCategory.DRY_SCRUBBER]: ['Dry Sorbent Injection', 'Semi-Dry Scrubber'],
  [APCDCategory.HYBRID_OTHER]: [
    'Hybrid ESP-Baghouse',
    'Hybrid Wet-Dry Scrubbers',
    'Electrostatic Gravel Bed',
    'New Advance/Patented/Hybrid Technologies',
  ],
  [APCDCategory.FUME_EXTRACTION]: ['Industrial Fume/Dust Extraction System'],
};
