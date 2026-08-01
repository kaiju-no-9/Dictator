import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { mediaFiles } from '../schema.js';

export const mediaRepo = {
  async create(data: typeof mediaFiles.$inferInsert) {
    const [f] = await db.insert(mediaFiles).values(data).returning();
    return f;
  },

  async findById(id: string) {
    return db.query.mediaFiles.findFirst({
      where: eq(mediaFiles.id, id),
    });
  },

  async findByProject(projectId: string) {
    return db.select().from(mediaFiles).where(eq(mediaFiles.projectId, projectId));
  },

  async updateStatus(id: string, status: string) {
    const [u] = await db.update(mediaFiles)
      .set({ status })
      .where(eq(mediaFiles.id, id))
      .returning();
    return u;
  },
};
