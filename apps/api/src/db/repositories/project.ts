import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { projects } from '../schema.js';

export const projectRepo = {
  async create(data: { title: string; description?: string }) {
    const [p] = await db.insert(projects).values(data).returning();
    return p;
  },

  async findById(id: string) {
    return db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
  },

  async list() {
    return db.select().from(projects).orderBy(projects.createdAt);
  },

  async updateStatus(id: string, status: string) {
    const [u] = await db.update(projects)
      .set({ status, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return u;
  },
};
