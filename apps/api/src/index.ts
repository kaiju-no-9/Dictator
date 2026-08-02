import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './middleware/logger.js';
import { projectRoutes } from './routes/projects.js';
import { uploadRoutes } from './routes/uploads.js';
import { planRoutes } from './routes/plans.js';
import { renderRoutes } from './routes/renders.js';
import { jobRoutes } from './routes/jobs.js';

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────────────────────
app.use('*', cors());
app.use('*', honoLogger());
app.onError(errorHandler);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'dictator-api', version: '0.1.0' })
);

// ── API v1 ─────────────────────────────────────────────────────────────────────
const api = new Hono();

api.route('/projects', projectRoutes);   // POST /projects, GET /projects, GET /projects/:id
api.route('/projects', uploadRoutes);    // POST /projects/:id/uploads
api.route('/projects', planRoutes);      // GET/PUT /projects/:id/plan, GET /projects/:id/plan/revisions
api.route('/projects', renderRoutes);    // POST /projects/:id/render, GET /projects/:id/renders/:id
api.route('/jobs', jobRoutes);           // GET /jobs/:id

app.route('/api/v1', api);

// ── Start server ───────────────────────────────────────────────────────────────
logger.info(`Starting Dictator API on port ${config.API_PORT}...`);

serve(
  { fetch: app.fetch, port: config.API_PORT },
  (info) => {
    logger.info(`✅ Dictator API running at http://localhost:${info.port}`);
    logger.info(`   Health: http://localhost:${info.port}/health`);
    logger.info(`   API:    http://localhost:${info.port}/api/v1`);
  }
);

export default app;
