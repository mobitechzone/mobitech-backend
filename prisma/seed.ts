import { PrismaClient, Role, ExpenseCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@mobitech.tn' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@mobitech.tn',
      phone: '+216 00 000 000',
      password,
      role: Role.ADMIN,
      permission: {
        create: {
          canDiscount: true,
          canCustomPrice: true,
          canRefund: true,
          canDeleteSale: true,
        },
      },
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'employee@mobitech.tn' },
    update: {},
    create: {
      name: 'Sales Employee',
      email: 'employee@mobitech.tn',
      phone: '+216 00 000 001',
      password,
      role: Role.EMPLOYEE,
      permission: {
        create: { canDiscount: true },
      },
    },
  });

  const categories = [
    { name: 'Phones', icon: 'smartphone', color: '#ff7a00' },
    { name: 'Accessories', icon: 'headphones', color: '#8b5cf6' },
    { name: 'Chargers', icon: 'zap', color: '#f59e0b' },
    { name: 'Cables', icon: 'cable', color: '#3b82f6' },
    { name: 'Headphones', icon: 'headphones', color: '#06b6d4' },
    { name: 'Cases', icon: 'package', color: '#10b981' },
    { name: 'Screen Protectors', icon: 'shield', color: '#6366f1' },
    { name: 'Tablets', icon: 'tablet', color: '#ec4899' },
    { name: 'Smart Watches', icon: 'watch', color: '#14b8a6' },
    { name: 'Other', icon: 'box', color: '#64748b' },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
      update: {},
      create: { name: c.name, slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), icon: c.icon, color: c.color },
    });
  }

  const defaults = [
    { key: 'company.name', value: 'MobiTech', group: 'COMPANY' },
    { key: 'company.address', value: 'Avenue Habib Bourguiba, Tunis', group: 'COMPANY' },
    { key: 'company.phone', value: '+216 00 000 000', group: 'COMPANY' },
    { key: 'receipt.header', value: 'MobiTech - Phones & Repairs', group: 'RECEIPT' },
    { key: 'receipt.footer', value: 'Thank you for your visit!', group: 'RECEIPT' },
    { key: 'currency', value: 'TND', group: 'GENERAL' },
    { key: 'vat.rate', value: 19, group: 'TAX' },
    { key: 'theme.mode', value: 'dark', group: 'THEME' },
    { key: 'backup.automatic', value: true, group: 'BACKUP' },
    { key: 'backup.intervalDays', value: 7, group: 'BACKUP' },
  ];

  for (const s of defaults) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value, group: s.group },
    });
  }

  console.log('Seed complete.');
  console.log(`  Admin:    admin@mobitech.tn / admin123 (${admin.id})`);
  console.log(`  Employee: employee@mobitech.tn / admin123 (${employee.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
