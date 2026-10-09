import { prisma } from '../lib/prisma';

export class CategoryService {
  static async getAll() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    // Build tree
    const rootCategories = categories.filter(c => !c.parentId);
    const getChildren = (parentId: string): any[] => {
      return categories
        .filter(c => c.parentId === parentId)
        .map(c => ({ ...c, children: getChildren(c.id) }));
    };

    return rootCategories.map(c => ({ ...c, children: getChildren(c.id) }));
  }

  static async getById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: { where: { status: 'ACTIVE' } } }
        }
      }
    });
    if (!category) throw new Error('Category not found');
    return category;
  }

  static async create(data: { name: string, description?: string, parentId?: string, iconUrl?: string, sortOrder?: number }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return prisma.category.create({
      data: { ...data, slug }
    });
  }

  static async update(id: string, data: any) {
    if (data.name) {
      data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    return prisma.category.update({
      where: { id },
      data
    });
  }
}
