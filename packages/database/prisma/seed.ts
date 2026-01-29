import {
  PrismaClient,
  APCDCategory,
  PaymentType,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ========================================
  // 1. Seed APCD Types (7 categories, 25+ subtypes)
  // ========================================
  const apcdTypes = [
    // ESP
    { category: APCDCategory.ESP, subType: 'Dry ESP (Plate/Tube Type)', sortOrder: 1 },
    { category: APCDCategory.ESP, subType: 'Wet ESP', sortOrder: 2 },

    // Bag Filter / Baghouse Systems
    { category: APCDCategory.BAG_FILTER, subType: 'Pulse Jet Baghouse', sortOrder: 3 },
    { category: APCDCategory.BAG_FILTER, subType: 'Reverse Air Baghouse', sortOrder: 4 },
    { category: APCDCategory.BAG_FILTER, subType: 'Mechanical Shaker Baghouse', sortOrder: 5 },

    // Cyclones
    { category: APCDCategory.CYCLONE, subType: 'Single Cyclone', sortOrder: 6 },
    { category: APCDCategory.CYCLONE, subType: 'Twin Cyclone', sortOrder: 7 },
    { category: APCDCategory.CYCLONE, subType: 'Multi Cyclone / Multi-Clone', sortOrder: 8 },
    { category: APCDCategory.CYCLONE, subType: 'High-Efficiency Cyclone', sortOrder: 9 },

    // Wet Scrubber
    { category: APCDCategory.WET_SCRUBBER, subType: 'Venturi Scrubber', sortOrder: 10 },
    { category: APCDCategory.WET_SCRUBBER, subType: 'Spray Tower / Spray Scrubber', sortOrder: 11 },
    { category: APCDCategory.WET_SCRUBBER, subType: 'Packed Bed Scrubber', sortOrder: 12 },
    { category: APCDCategory.WET_SCRUBBER, subType: 'Submerged Scrubber', sortOrder: 13 },
    { category: APCDCategory.WET_SCRUBBER, subType: 'Multi-Stage Wet Scrubber', sortOrder: 14 },

    // Dry Scrubber
    { category: APCDCategory.DRY_SCRUBBER, subType: 'Dry Sorbent Injection', sortOrder: 15 },
    { category: APCDCategory.DRY_SCRUBBER, subType: 'Semi-Dry Scrubber', sortOrder: 16 },

    // Hybrid / Other
    { category: APCDCategory.HYBRID_OTHER, subType: 'Hybrid ESP-Baghouse', sortOrder: 17 },
    { category: APCDCategory.HYBRID_OTHER, subType: 'Hybrid Wet-Dry Scrubbers', sortOrder: 18 },
    { category: APCDCategory.HYBRID_OTHER, subType: 'Electrostatic Gravel Bed', sortOrder: 19 },
    { category: APCDCategory.HYBRID_OTHER, subType: 'New Advance/Patented/Hybrid Technologies', sortOrder: 20 },

    // Fume Extraction
    { category: APCDCategory.FUME_EXTRACTION, subType: 'Industrial Fume/Dust Extraction System', sortOrder: 21 },
  ];

  for (const apcd of apcdTypes) {
    await prisma.aPCDType.upsert({
      where: { category_subType: { category: apcd.category, subType: apcd.subType } },
      update: {},
      create: apcd,
    });
  }
  console.log(`Seeded ${apcdTypes.length} APCD types`);

  // ========================================
  // 2. Seed Fee Configuration (from SOP)
  // ========================================
  const feeConfigs = [
    {
      paymentType: PaymentType.APPLICATION_FEE,
      baseAmount: 25000,
      description: 'Application Processing Fee - one-time, non-refundable',
    },
    {
      paymentType: PaymentType.EMPANELMENT_FEE,
      baseAmount: 65000,
      description: 'Empanelment Fee - per APCD model type',
    },
    {
      paymentType: PaymentType.FIELD_VERIFICATION,
      baseAmount: 57000,
      description: 'Field Verification Fee - payable when field verification is required',
    },
    {
      paymentType: PaymentType.EMISSION_TESTING,
      baseAmount: 0, // Actuals
      description: 'Emission Testing Fee - charged on actuals',
    },
    {
      paymentType: PaymentType.ANNUAL_RENEWAL,
      baseAmount: 35000,
      description: 'Annual Renewal Fee - payable 60 days before expiry',
    },
    {
      paymentType: PaymentType.SURVEILLANCE_VISIT,
      baseAmount: 0, // Actuals
      description: 'Surveillance Visit - charges on actuals as required',
    },
  ];

  for (const fee of feeConfigs) {
    await prisma.feeConfiguration.upsert({
      where: { paymentType: fee.paymentType },
      update: {},
      create: {
        paymentType: fee.paymentType,
        baseAmount: fee.baseAmount,
        gstRate: 18,
        discountPercent: 15,
        description: fee.description,
      },
    });
  }
  console.log(`Seeded ${feeConfigs.length} fee configurations`);

  // ========================================
  // 3. Seed Admin User
  // ========================================
  const adminPasswordHash = await bcrypt.hash('Admin@APCD2025!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@npcindia.gov.in' },
    update: {},
    create: {
      email: 'admin@npcindia.gov.in',
      passwordHash: adminPasswordHash,
      role: Role.SUPER_ADMIN,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
      isVerified: true,
    },
  });
  console.log('Seeded admin user: admin@npcindia.gov.in');

  // Seed a test officer
  const officerPasswordHash = await bcrypt.hash('Officer@APCD2025!', 12);
  await prisma.user.upsert({
    where: { email: 'officer@npcindia.gov.in' },
    update: {},
    create: {
      email: 'officer@npcindia.gov.in',
      passwordHash: officerPasswordHash,
      role: Role.OFFICER,
      firstName: 'Test',
      lastName: 'Officer',
      isActive: true,
      isVerified: true,
    },
  });
  console.log('Seeded test officer: officer@npcindia.gov.in');

  console.log('Database seeding completed.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
