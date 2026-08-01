import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { jobs, jobEvents } from '../schema.js';

export const jobRepo = {
  async create(data: typeof jobs.$inferInsert) {
    const [j] = await db.insert(jobs).values(data).returning();
    return j;
  },

  async findById(id: string) {
    return db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });
  },

  async updateProgress(id: string, progress: number, currentStage?: string) {
    const [u] = await db.update(jobs)
      .set({ progress, currentStage })
      .where(eq(jobs.id, id))
      .returning();
    return u;
  },

  async updateStatus(id: string, status: string, errorDetails?: unknown) {
    const now = new Date();
    const [u] = await db.update(jobs)
      .set({
        status,
        errorDetails: errorDetails as any,
        ...(status === 'running' ? { startedAt: now } : {}),
        ...(status === 'completed' || status === 'failed' ? { completedAt: now } : {}),
      })
      .where(eq(jobs.id, id))
      .returning();
    return u;
  },

  async addEvent(data: typeof jobEvents.$inferInsert) {
    const [e] = await db.insert(jobEvents).values(data).returning();
    return e;
  },

  async getEvents(jobId: string) {
    return db.select().from(jobEvents).where(eq(jobEvents.jobId, jobId));
  },
};
