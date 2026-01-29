import { Injectable } from '@nestjs/common';
import { APCDCategory } from '@apcd/database';

import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ApcdTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.aPCDType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findByCategory(category: APCDCategory) {
    return this.prisma.aPCDType.findMany({
      where: { category, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findGroupedByCategory() {
    const all = await this.findAll();
    const grouped: Record<string, typeof all> = {};
    for (const apcd of all) {
      if (!grouped[apcd.category]) grouped[apcd.category] = [];
      grouped[apcd.category].push(apcd);
    }
    return grouped;
  }

  // Category display names
  private readonly categoryNames: Record<string, { name: string; description: string }> = {
    ESP: {
      name: 'Electrostatic Precipitator (ESP)',
      description: 'High-efficiency particulate collection using electrostatic forces',
    },
    BAG_FILTER: {
      name: 'Bag Filter / Baghouse Systems',
      description: 'Fabric filtration systems for dust collection',
    },
    CYCLONE: {
      name: 'Cyclone Separators',
      description: 'Centrifugal separation of particulate matter',
    },
    WET_SCRUBBER: {
      name: 'Wet Scrubbers',
      description: 'Liquid-based gas cleaning systems',
    },
    DRY_SCRUBBER: {
      name: 'Dry Scrubbers',
      description: 'Dry reagent injection systems for gas cleaning',
    },
    HYBRID_OTHER: {
      name: 'Hybrid & Other Technologies',
      description: 'Combined systems and advanced technologies',
    },
    FUME_EXTRACTION: {
      name: 'Fume Extraction Systems',
      description: 'Industrial fume and dust extraction equipment',
    },
  };

  async findCategoriesWithTypes() {
    const all = await this.findAll();
    const grouped = new Map<string, any[]>();

    for (const apcd of all) {
      if (!grouped.has(apcd.category)) {
        grouped.set(apcd.category, []);
      }
      grouped.get(apcd.category)!.push({
        id: apcd.id,
        name: apcd.subType,
        description: null,
      });
    }

    const categories = [];
    for (const [category, types] of grouped) {
      const categoryInfo = this.categoryNames[category] || {
        name: category,
        description: '',
      };
      categories.push({
        id: category,
        name: categoryInfo.name,
        description: categoryInfo.description,
        types,
      });
    }

    return categories;
  }
}
