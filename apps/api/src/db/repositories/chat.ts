import { eq, desc } from 'drizzle-orm';
import { db } from '../client.js';
import { chatMessages } from '../schema.js';

export const chatRepo = {
  async create(data: typeof chatMessages.$inferInsert) {
    const [msg] = await db.insert(chatMessages).values(data).returning();
    return msg;
  },

  async findByProject(projectId: string) {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .orderBy(chatMessages.createdAt);
  },

  async findRecent(projectId: string, limit = 20) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.projectId, projectId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse(); // return chronological order
  },
};
