import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { renderJobs } from '../schema.js';

export const renderRepo = {
  async create(data: typeof renderJobs.$inferInsert) {
    const [j] = await db.insert(renderJobs).values(data).returning();
    return j;
  },

  async findById(id: string) {
    return db.query.renderJobs.findFirst({
      where: eq(renderJobs.id, id),
    });
  },

  async updateStatus(id: string, status: string, extra?: Partial<typeof renderJobs.$inferInsert>) {
    const [u] = await db
      .update(renderJobs)
      .set({ status, ...extra })
      .where(eq(renderJobs.id, id))
      .returning();
    return u;
  },
};
