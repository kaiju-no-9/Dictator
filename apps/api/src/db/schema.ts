import { pgTable, uuid, varchar, text, integer, real, bigint, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('created'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  index('idx_projects_status').on(t.status),
]));

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  originalFilename: varchar('original_filename', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  durationSeconds: real('duration_seconds'),
  width: integer('width'),
  height: integer('height'),
  fps: real('fps'),
  s3RawKey: varchar('s3_raw_key', { length: 1000 }).notNull(),
  s3ProcessedKey: varchar('s3_processed_key', { length: 1000 }),
  s3ProxyKey: varchar('s3_proxy_key', { length: 1000 }),
  s3ThumbnailKey: varchar('s3_thumbnail_key', { length: 1000 }),
  status: varchar('status', { length: 50 }).notNull().default('uploaded'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  index('idx_media_files_project').on(t.projectId),
]));

export const shots = pgTable('shots', {
  id: uuid('id').defaultRandom().primaryKey(),
  mediaFileId: uuid('media_file_id').notNull().references(() => mediaFiles.id, { onDelete: 'cascade' }),
  shotId: varchar('shot_id', { length: 20 }).notNull(),
  startSeconds: real('start_seconds').notNull(),
  endSeconds: real('end_seconds').notNull(),
  durationSeconds: real('duration_seconds').notNull(),
  frameStart: integer('frame_start').notNull(),
  frameEnd: integer('frame_end').notNull(),
  groupId: varchar('group_id', { length: 100 }),
  role: varchar('role', { length: 50 }).default('primary'),
  isBestTake: boolean('is_best_take').default(true),
  qualityScore: real('quality_score'),
  visualDescription: text('visual_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  unique('uq_shots_media_shot').on(t.mediaFileId, t.shotId),
  index('idx_shots_shot_id').on(t.shotId),
]));

export const shotTags = pgTable('shot_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  shotDbId: uuid('shot_db_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  tag: varchar('tag', { length: 100 }).notNull(),
}, (t) => ([
  index('idx_shot_tags_shot').on(t.shotDbId),
]));

export const transcriptSegments = pgTable('transcript_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  shotDbId: uuid('shot_db_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  startSeconds: real('start_seconds').notNull(),
  endSeconds: real('end_seconds').notNull(),
  speakerId: integer('speaker_id'),
});

export const transcriptWords = pgTable('transcript_words', {
  id: uuid('id').defaultRandom().primaryKey(),
  segmentId: uuid('segment_id').notNull().references(() => transcriptSegments.id, { onDelete: 'cascade' }),
  word: varchar('word', { length: 200 }).notNull(),
  startSeconds: real('start_seconds').notNull(),
  endSeconds: real('end_seconds').notNull(),
  confidence: real('confidence'),
});

export const editPlanRevisions = pgTable('edit_plan_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  parentRevision: integer('parent_revision'),
  planJson: jsonb('plan_json').notNull(),
  source: varchar('source', { length: 50 }).notNull().default('agent'),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  unique('uq_plan_project_rev').on(t.projectId, t.revisionNumber),
]));

export const renderJobs = pgTable('render_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  planRevisionId: uuid('plan_revision_id').notNull().references(() => editPlanRevisions.id),
  renderType: varchar('render_type', { length: 50 }).notNull().default('proxy'),
  status: varchar('status', { length: 50 }).notNull().default('queued'),
  s3OutputKey: varchar('s3_output_key', { length: 1000 }),
  renderConfig: jsonb('render_config'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  jobType: varchar('job_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('queued'),
  progress: real('progress').default(0),
  currentStage: varchar('current_stage', { length: 100 }),
  errorDetails: jsonb('error_details'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  index('idx_jobs_project').on(t.projectId),
  index('idx_jobs_status').on(t.status),
]));

export const jobEvents = pgTable('job_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  message: text('message'),
  data: jsonb('data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),             // "user" | "assistant"
  content: text('content').notNull(),
  planRevisionId: uuid('plan_revision_id').references(() => editPlanRevisions.id), // which revision this message created (nullable)
  changes: jsonb('changes'),                                    // list of human-readable change descriptions
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  index('idx_chat_messages_project').on(t.projectId),
]));
