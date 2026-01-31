import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { ApcdTypesService } from './apcd-types.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApcdTypes = [
  {
    id: 'type-1',
    category: 'ESP',
    subType: 'Dry ESP',
    description: 'Dry Electrostatic Precipitator',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'type-2',
    category: 'ESP',
    subType: 'Wet ESP',
    description: 'Wet Electrostatic Precipitator',
    sortOrder: 2,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'type-3',
    category: 'BAG_FILTER',
    subType: 'Pulse Jet Bag Filter',
    description: 'Pulse jet cleaning bag filter',
    sortOrder: 3,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'type-4',
    category: 'BAG_FILTER',
    subType: 'Reverse Air Bag Filter',
    description: 'Reverse air cleaning bag filter',
    sortOrder: 4,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'type-5',
    category: 'CYCLONE',
    subType: 'Multi-Cyclone',
    description: 'Multi-cyclone separator',
    sortOrder: 5,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ApcdTypesService', () => {
  let service: ApcdTypesService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApcdTypesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApcdTypesService>(ApcdTypesService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // findAll()
  // =========================================================================

  describe('findAll', () => {
    it('should return all active APCD types ordered by sortOrder', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findAll();

      expect(result).toEqual(mockApcdTypes);
      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return empty array when no active types exist', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('should only query active types', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('should call findMany exactly once', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.aPCDType.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // findByCategory()
  // =========================================================================

  describe('findByCategory', () => {
    it('should return types filtered by category', async () => {
      const espTypes = mockApcdTypes.filter((t) => t.category === 'ESP');
      prisma.aPCDType.findMany.mockResolvedValue(espTypes as any);

      const result = await service.findByCategory('ESP' as any);

      expect(result).toEqual(espTypes);
      expect(result).toHaveLength(2);
      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith({
        where: { category: 'ESP', isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return empty array for category with no types', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.findByCategory('WET_SCRUBBER' as any);

      expect(result).toEqual([]);
    });

    it('should filter by both category and isActive', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      await service.findByCategory('BAG_FILTER' as any);

      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith({
        where: { category: 'BAG_FILTER', isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return single item for category with one type', async () => {
      const cycloneTypes = mockApcdTypes.filter((t) => t.category === 'CYCLONE');
      prisma.aPCDType.findMany.mockResolvedValue(cycloneTypes as any);

      const result = await service.findByCategory('CYCLONE' as any);

      expect(result).toHaveLength(1);
      expect(result[0].subType).toBe('Multi-Cyclone');
    });
  });

  // =========================================================================
  // findGroupedByCategory()
  // =========================================================================

  describe('findGroupedByCategory', () => {
    it('should group types by category', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findGroupedByCategory();

      expect(result).toHaveProperty('ESP');
      expect(result).toHaveProperty('BAG_FILTER');
      expect(result).toHaveProperty('CYCLONE');
      expect(result['ESP']).toHaveLength(2);
      expect(result['BAG_FILTER']).toHaveLength(2);
      expect(result['CYCLONE']).toHaveLength(1);
    });

    it('should return empty object when no types exist', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.findGroupedByCategory();

      expect(result).toEqual({});
    });

    it('should call findAll internally (reuse the findMany call)', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      await service.findGroupedByCategory();

      expect(prisma.aPCDType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should preserve all items in each category group', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findGroupedByCategory();

      // All 5 items should be distributed across 3 categories
      const totalItems = Object.values(result).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );
      expect(totalItems).toBe(5);
    });

    it('should handle a single category correctly', async () => {
      const singleCategory = mockApcdTypes.filter((t) => t.category === 'ESP');
      prisma.aPCDType.findMany.mockResolvedValue(singleCategory as any);

      const result = await service.findGroupedByCategory();

      expect(Object.keys(result)).toEqual(['ESP']);
      expect(result['ESP']).toHaveLength(2);
    });

    it('should not create empty category groups', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findGroupedByCategory();

      for (const key of Object.keys(result)) {
        expect(result[key].length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // findCategoriesWithTypes()
  // =========================================================================

  describe('findCategoriesWithTypes', () => {
    it('should return categories with their types and display names', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(3); // ESP, BAG_FILTER, CYCLONE
    });

    it('should use known category display names for ESP', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();
      const espCategory = result.find((c: any) => c.id === 'ESP');

      expect(espCategory).toBeDefined();
      expect(espCategory.name).toBe('Electrostatic Precipitator (ESP)');
      expect(espCategory.description).toBe(
        'High-efficiency particulate collection using electrostatic forces',
      );
    });

    it('should use known category display names for BAG_FILTER', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();
      const bagFilterCategory = result.find((c: any) => c.id === 'BAG_FILTER');

      expect(bagFilterCategory).toBeDefined();
      expect(bagFilterCategory.name).toBe('Bag Filter / Baghouse Systems');
    });

    it('should use known category display names for CYCLONE', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();
      const cycloneCategory = result.find((c: any) => c.id === 'CYCLONE');

      expect(cycloneCategory).toBeDefined();
      expect(cycloneCategory.name).toBe('Cyclone Separators');
      expect(cycloneCategory.description).toBe('Centrifugal separation of particulate matter');
    });

    it('should map type subType to name field', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();
      const espCategory = result.find((c: any) => c.id === 'ESP');

      expect(espCategory.types[0]).toEqual({
        id: 'type-1',
        name: 'Dry ESP',
        description: null,
      });
    });

    it('should fall back to category string for unknown categories', async () => {
      const unknownType = {
        id: 'type-unknown',
        category: 'UNKNOWN_CATEGORY',
        subType: 'Some Type',
        description: 'Unknown category type',
        sortOrder: 99,
        isActive: true,
        createdAt: new Date('2025-01-01'),
      };
      prisma.aPCDType.findMany.mockResolvedValue([unknownType] as any);

      const result = await service.findCategoriesWithTypes();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('UNKNOWN_CATEGORY');
      expect(result[0].name).toBe('UNKNOWN_CATEGORY');
      expect(result[0].description).toBe('');
    });

    it('should return empty array when no types exist', async () => {
      prisma.aPCDType.findMany.mockResolvedValue([]);

      const result = await service.findCategoriesWithTypes();

      expect(result).toEqual([]);
    });

    it('should include correct type count per category', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();
      const espCategory = result.find((c: any) => c.id === 'ESP');
      const cycloneCategory = result.find((c: any) => c.id === 'CYCLONE');

      expect(espCategory.types).toHaveLength(2);
      expect(cycloneCategory.types).toHaveLength(1);
    });

    it('should set description to null for each type entry', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();

      for (const category of result) {
        for (const type of category.types) {
          expect(type.description).toBeNull();
        }
      }
    });

    it('should preserve category order based on data order', async () => {
      prisma.aPCDType.findMany.mockResolvedValue(mockApcdTypes as any);

      const result = await service.findCategoriesWithTypes();

      expect(result[0].id).toBe('ESP');
      expect(result[1].id).toBe('BAG_FILTER');
      expect(result[2].id).toBe('CYCLONE');
    });
  });
});
