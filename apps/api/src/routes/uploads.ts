import { Hono } from 'hono';
import { projectRepo } from '../db/repositories/project.js';
import { mediaRepo } from '../db/repositories/media.js';
import { uploadToS3 } from '../storage/s3.js';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';
import { ALLOWED_VIDEO_MIMES } from '@dictator/shared';

export const uploadRoutes = new Hono();

// /projects/:id/uploads
uploadRoutes.post('/:id/uploads', async (c) => {
  const projectId = c.req.param('id');

  const project = await projectRepo.findById(projectId);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const formData = await c.req.parseBody({ all: true });
  const rawFiles = formData['files'];
  const files = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];

  if (files.length === 0) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No files provided in "files" field' } }, 400);
  }

  const uploaded: object[] = [];
  const errors: object[] = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;

    // Validate MIME type
    if (!ALLOWED_VIDEO_MIMES.has(file.type)) {
      errors.push({ filename: file.name, reason: `Unsupported file type: ${file.type}` });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadId = crypto.randomUUID();
      const rawKey = `raw/${projectId}/${uploadId}/${file.name}`;

      logger.info({ projectId, filename: file.name, size: buffer.length }, 'Uploading to S3');
      await uploadToS3(config.S3_BUCKET_RAW, rawKey, buffer, file.type);

      const record = await mediaRepo.create({
        projectId,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: buffer.length,
        s3RawKey: rawKey,
        status: 'uploaded',
      });

      uploaded.push(record);
      logger.info({ projectId, mediaFileId: record.id }, 'File uploaded');
    } catch (err) {
      logger.error({ err, filename: file.name }, 'Upload failed');
      errors.push({ filename: file.name, reason: 'Upload failed' });
    }
  }

  return c.json({ uploaded, errors }, 201);
});
