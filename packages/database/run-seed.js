// Simple seed runner that uses Prisma to execute raw SQL
// No external dependencies beyond @prisma/client
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Check if APCD types already exist
    const count = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM apcd_types`;
    if (count[0].count > 0) {
      console.log(`Database already seeded (${count[0].count} APCD types found). Skipping.`);
      return;
    }

    console.log('Seeding database...');
    const sqlPath = path.join(__dirname, 'prisma', 'seed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (err) {
        // Log but continue - ON CONFLICT statements may cause some Prisma warnings
        console.log('Statement result:', err.message?.substring(0, 100) || 'OK');
      }
    }

    const apcdCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM apcd_types`;
    const feeCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM fee_configurations`;
    const userCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM users WHERE role IN ('SUPER_ADMIN', 'OFFICER')`;

    console.log(`Seed completed: ${apcdCount[0].count} APCD types, ${feeCount[0].count} fee configs, ${userCount[0].count} admin/officer users`);
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
