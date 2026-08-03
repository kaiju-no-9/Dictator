import { startFullPipeline } from '../queue/pipelines.js';
import { jobRepo } from '../db/repositories/job.js';
import { mediaRepo } from '../db/repositories/media.js';
import { projectRepo } from '../db/repositories/project.js';
import { logger } from '../middleware/logger.js';

/**
 * Start the full AI pipeline for a project.
 * Creates a DB job record, enqueues BullMQ flow, and returns the job.
 */
export const pipelineService = {
  async start(projectId: string) {
    // 1. Fetch all processed uploads for this project
    const mediaFiles = await mediaRepo.findByProject(projectId);
    if (mediaFiles.length === 0) {
      throw new Error('No media files found. Upload at least one video first.');
    }

    const mediaFileIds = mediaFiles.map((f) => f.id);

    // 2. Create a DB job record for progress tracking
    const job = await jobRepo.create({
      projectId,
      jobType: 'full_pipeline',
      status: 'queued',
      progress: 0,
      currentStage: 'ingestion',
    });

    await jobRepo.addEvent({
      jobId: job.id,
      eventType: 'pipeline_queued',
      message: `Pipeline queued for ${mediaFileIds.length} file(s)`,
      data: { mediaFileIds },
    });

    // 3. Update project status
    await projectRepo.updateStatus(projectId, 'processing');

    // 4. Enqueue BullMQ pipeline flow (passes dbJobId so workers can update progress)
    const flowJobId = await startFullPipeline(projectId, mediaFileIds);

    await jobRepo.addEvent({
      jobId: job.id,
      eventType: 'pipeline_started',
      message: `BullMQ flow started`,
      data: { flowJobId },
    });

    logger.info({ projectId, dbJobId: job.id, flowJobId }, 'Pipeline started');
    return job;
  },
};
