import { logger } from '../middleware/logger.js';

/**
 * Rendering service stubs.
 * Full FFmpeg and Shotstack implementations will be added in Part D.
 */
export const renderingService = {
  /**
   * Submit an Edit Plan to Shotstack for cloud rendering.
   * Used for final high-quality exports.
   */
  async renderWithShotstack(
    _planJson: unknown,
    _renderType: 'proxy' | 'final'
  ): Promise<string> {
    logger.info({ renderType: _renderType }, 'Shotstack render not yet implemented');
    throw new Error('Shotstack rendering not implemented yet — coming in Part D');
  },

  /**
   * Render an Edit Plan locally using FFmpeg.
   * Used for proxy (low-res preview) renders.
   */
  async renderWithFFmpeg(
    _planJson: unknown,
    _renderType: 'proxy' | 'final',
    _outputPath: string
  ): Promise<void> {
    logger.info({ renderType: _renderType }, 'FFmpeg render not yet implemented');
    throw new Error('FFmpeg rendering not implemented yet — coming in Part D');
  },
};
