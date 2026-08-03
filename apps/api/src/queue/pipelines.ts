import { FlowProducer } from 'bullmq';
import { redisConnection } from './bullmq.js';
import { logger } from '../middleware/logger.js';

// ── Flow Producer ─────────────────────────────────────────────────────────────
// BullMQ FlowProducer lets you define a parent→child dependency tree.
// A parent job only starts AFTER all its children complete successfully.
//
// Pipeline order (bottom-up, children run first):
//
//   ingest (ingestion queue)
//     → analyze (ai queue)
//       → generate-plan (ai queue)
//         → validate-plan (validation queue)
//           → render-proxy (render queue)   ← root job

const flowProducer = new FlowProducer({ connection: redisConnection });

export interface PipelineResult {
  flowJobId: string;      // Root BullMQ job ID
  projectJobId: string;   // Our DB jobs.id (set by caller)
}

/**
 * Start the full ingestion → AI → validation → proxy-render pipeline.
 *
 * @param projectId  - UUID of the project
 * @param mediaFileIds - IDs of uploaded media_files records to process
 * @returns the root BullMQ flow job ID
 */
export async function startFullPipeline(
  projectId: string,
  mediaFileIds: string[]
): Promise<string> {
  logger.info({ projectId, mediaFileIds }, 'Starting full pipeline');

  const flow = await flowProducer.add({
    // ── Stage 5: Proxy render (runs last, after validation) ───────────────────
    name: 'render-proxy',
    queueName: 'render',
    data: { projectId, renderType: 'proxy' },

    children: [
      {
        // ── Stage 4: System validation of generated plan ─────────────────────
        name: 'validate-plan',
        queueName: 'validation',
        data: { projectId },

        children: [
          {
            // ── Stage 3: LLM agent generates edit plan ────────────────────────
            name: 'generate-plan',
            queueName: 'ai',
            data: { projectId },

            children: [
              {
                // ── Stage 2: AI service analyzes shots+transcript+tags ────────
                name: 'analyze',
                queueName: 'ai',
                data: { projectId, mediaFileIds },

                children: [
                  {
                    // ── Stage 1: Ingest & transcode raw uploads ───────────────
                    name: 'ingest',
                    queueName: 'ingestion',
                    data: { projectId, mediaFileIds },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  const rootJobId = flow.job.id!;
  logger.info({ projectId, rootJobId }, 'Pipeline flow created');
  return rootJobId;
}

/**
 * Queue a standalone render job (proxy or final) without re-running the full pipeline.
 * Used when the user triggers a render manually after editing the plan.
 */
export async function startRenderJob(
  projectId: string,
  planRevisionId: string,
  renderType: 'proxy' | 'final'
): Promise<string> {
  const { renderQueue } = await import('./bullmq.js');

  const job = await renderQueue.add('render-manual', {
    projectId,
    planRevisionId,
    renderType,
  });

  logger.info({ projectId, jobId: job.id, renderType }, 'Manual render queued');
  return job.id!;
}
