import { eq, desc, and } from 'drizzle-orm';
import { db } from '../client.js';
import { editPlanRevisions } from '../schema.js';

export const planRepo = {
  async create(data: typeof editPlanRevisions.$inferInsert) {
    const [r] = await db.insert(editPlanRevisions).values(data).returning();
    return r;
  },

  async findLatest(projectId: string) {
    return db.query.editPlanRevisions.findFirst({
      where: eq(editPlanRevisions.projectId, projectId),
      orderBy: [desc(editPlanRevisions.revisionNumber)],
    });
  },

  async findByRevision(projectId: string, rev: number) {
    return db.query.editPlanRevisions.findFirst({
      where: and(
        eq(editPlanRevisions.projectId, projectId),
        eq(editPlanRevisions.revisionNumber, rev)
      ),
    });
  },

  async listRevisions(projectId: string) {
    return db.select()
      .from(editPlanRevisions)
      .where(eq(editPlanRevisions.projectId, projectId))
      .orderBy(desc(editPlanRevisions.revisionNumber));
  },

  async updateStatus(id: string, status: string) {
    const [u] = await db.update(editPlanRevisions)
      .set({ status })
      .where(eq(editPlanRevisions.id, id))
      .returning();
    return u;
  },
};
