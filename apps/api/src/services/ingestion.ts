import { mediaRepo } from '../db/repositories/media.js';
import { logger } from '../middleware/logger.js';

/**
 * Handles the post-upload state management for a media file.
 * FFmpeg transcoding (proxy + thumbnail) will be added in Part D.
 */
export const ingestionService = {
  async processUpload(projectId: string, mediaFileId: string) {
    const mf = await mediaRepo.findById(mediaFileId);
    if (!mf) throw new Error(`Media file not found: ${mediaFileId}`);

    logger.info({ projectId, mediaFileId, filename: mf.originalFilename }, 'Processing upload');

    await mediaRepo.updateStatus(mediaFileId, 'transcoding');

    // TODO (Part D): Download from S3, run FFmpeg proxy transcode,
    // generate thumbnail, upload proxy + thumbnail back to S3,
    // update s3ProxyKey + s3ThumbnailKey + durationSeconds + width + height + fps

    await mediaRepo.updateStatus(mediaFileId, 'processed');
    logger.info({ mediaFileId }, 'Upload processed');
  },

  async processAll(projectId: string, mediaFileIds: string[]) {
    await Promise.all(
      mediaFileIds.map((id) => this.processUpload(projectId, id))
    );
  },
};
