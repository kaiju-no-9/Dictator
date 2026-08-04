import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../middleware/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ClipSegment {
  inputPath: string;   // local filesystem path to the source video
  trimIn: number;      // start time in seconds (within the source)
  trimOut: number;     // end time in seconds (within the source)
  speed?: number;      // playback speed multiplier (default 1.0)
  muteAudio?: boolean; // strip audio track from this clip
}

export interface ProxyOptions {
  height?: number;     // output height in pixels (default 720)
  crf?: number;        // H.264 quality (lower = better, default 28)
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Promisify a fluent-ffmpeg command */
function run(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd
      .on('start', (cmdLine) => logger.debug({ cmdLine }, 'FFmpeg started'))
      .on('end', () => resolve())
      .on('error', (err, _stdout, stderr) => {
        logger.error({ err, stderr }, 'FFmpeg error');
        reject(err);
      });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extract metadata from a video file
// ─────────────────────────────────────────────────────────────────────────────
export function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));

      const [fpsNum, fpsDen] = (videoStream.r_frame_rate ?? '30/1').split('/');
      const fps = Number(fpsNum) / Number(fpsDen);

      resolve({
        durationSeconds: Number(data.format.duration ?? 0),
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: Math.round(fps * 100) / 100,
        codec: videoStream.codec_name ?? 'unknown',
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Extract a single trimmed clip from a source video
// ─────────────────────────────────────────────────────────────────────────────
export async function extractClip(
  segment: ClipSegment,
  outputPath: string
): Promise<void> {
  const duration = segment.trimOut - segment.trimIn;

  if (duration <= 0) {
    throw new Error(`Invalid trim: trimIn=${segment.trimIn} trimOut=${segment.trimOut}`);
  }

  let cmd = ffmpeg(segment.inputPath)
    .setStartTime(segment.trimIn)
    .setDuration(duration)
    .videoCodec('libx264')
    .outputOptions([
      '-preset fast',
      '-crf 23',
      '-movflags +faststart',
      '-avoid_negative_ts make_zero',
    ]);

  // Apply speed change via setpts + atempo filters
  if (segment.speed && segment.speed !== 1.0) {
    const vFilter = `setpts=${(1 / segment.speed).toFixed(4)}*PTS`;
    const aFilter = `atempo=${segment.speed}`;
    cmd = cmd.videoFilters(vFilter).audioFilters(aFilter);
  }

  // Mute audio if requested
  if (segment.muteAudio) {
    cmd = cmd.noAudio();
  } else {
    cmd = cmd.audioCodec('aac').audioBitrate('192k');
  }

  await run(cmd.output(outputPath));
  logger.debug({ outputPath, duration }, 'Clip extracted');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Create a low-res proxy from a source video (for preview / AI analysis)
// ─────────────────────────────────────────────────────────────────────────────
export async function createProxy(
  inputPath: string,
  outputPath: string,
  options: ProxyOptions = {}
): Promise<void> {
  const { height = 720, crf = 28 } = options;

  await run(
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .size(`?x${height}`)           // scale to height, keep aspect ratio
      .outputOptions([
        `-crf ${crf}`,
        '-preset fast',
        '-movflags +faststart',
      ])
      .output(outputPath)
  );

  logger.debug({ outputPath, height }, 'Proxy created');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Generate a thumbnail at a specific timestamp
// ─────────────────────────────────────────────────────────────────────────────
export async function extractThumbnail(
  inputPath: string,
  outputPath: string,
  atSecond = 1.0
): Promise<void> {
  await run(
    ffmpeg(inputPath)
      .setStartTime(atSecond)
      .frames(1)
      .size('320x180')
      .output(outputPath)
  );

  logger.debug({ outputPath, atSecond }, 'Thumbnail extracted');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Concatenate multiple pre-trimmed clip files into one output video
//    Uses FFmpeg concat demuxer — lossless, no re-encode needed
// ─────────────────────────────────────────────────────────────────────────────
export async function concatenateClips(
  clipPaths: string[],
  outputPath: string,
  concatListPath: string
): Promise<void> {
  if (clipPaths.length === 0) throw new Error('No clips to concatenate');

  // Write the concat manifest
  const lines = clipPaths.map((p) => `file '${p}'`).join('\n');
  await fs.writeFile(concatListPath, lines, 'utf-8');

  await run(
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])   // stream copy — no re-encode
      .output(outputPath)
  );

  // Clean up manifest
  await fs.unlink(concatListPath).catch(() => {});
  logger.debug({ outputPath, clips: clipPaths.length }, 'Clips concatenated');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Full render pipeline: extract all clips → concatenate → output
// ─────────────────────────────────────────────────────────────────────────────
export async function renderEditPlan(
  segments: ClipSegment[],
  outputPath: string,
  workDir: string
): Promise<void> {
  await fs.mkdir(workDir, { recursive: true });

  // Extract each clip to a temp file
  const clipPaths: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const clipPath = path.join(workDir, `clip_${String(i).padStart(3, '0')}.mp4`);
    await extractClip(segments[i], clipPath);
    clipPaths.push(clipPath);
    logger.info({ clip: i + 1, total: segments.length }, 'Clip rendered');
  }

  // Concatenate all clips
  const concatListPath = path.join(workDir, 'concat.txt');
  await concatenateClips(clipPaths, outputPath, concatListPath);

  // Clean up temp clips
  await Promise.all(clipPaths.map((p) => fs.unlink(p).catch(() => {})));

  logger.info({ outputPath, clips: segments.length }, 'Full render complete');
}
