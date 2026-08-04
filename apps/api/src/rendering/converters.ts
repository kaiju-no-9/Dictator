import type { EditPlan, TimelineEntry, SourceShot } from '@dictator/shared';
import type { ClipSegment } from './ffmpeg.js';

// ─────────────────────────────────────────────────────────────────────────────
// EditPlan → FFmpeg ClipSegments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an EditPlan's timeline into a list of ClipSegments for FFmpeg.
 *
 * @param plan         - Validated EditPlan JSON
 * @param filePathMap  - Maps source_file name → absolute local path on disk
 *                       e.g. { "clip_a.mp4": "/tmp/renders/proj123/clip_a.mp4" }
 */
export function editPlanToClipSegments(
  plan: EditPlan,
  filePathMap: Record<string, string>
): ClipSegment[] {
  // Build a lookup from shot_id → SourceShot
  const shotMap = new Map<string, SourceShot>(
    plan.source_shots.map((s) => [s.shot_id, s])
  );

  const segments: ClipSegment[] = [];

  for (const entry of plan.timeline) {
    const shot = shotMap.get(entry.shot_id);
    if (!shot) {
      throw new Error(
        `Converter error: shot_id "${entry.shot_id}" not found in source_shots`
      );
    }

    const localPath = filePathMap[shot.source_file];
    if (!localPath) {
      throw new Error(
        `Converter error: no local path for source_file "${shot.source_file}". ` +
        `Make sure all files are downloaded from S3 before rendering.`
      );
    }

    segments.push({
      inputPath:  localPath,
      trimIn:     entry.trim_in,
      trimOut:    entry.trim_out,
      speed:      entry.speed ?? 1.0,
      muteAudio:  entry.source_audio === 'mute',
    });
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// EditPlan → Shotstack Timeline JSON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an EditPlan into a Shotstack-compatible timeline payload.
 * Used for cloud-based final renders via the Shotstack API.
 *
 * Docs: https://shotstack.io/docs/api/
 */
export function editPlanToShotstack(
  plan: EditPlan,
  s3BaseUrl: string
): Record<string, unknown> {
  const shotMap = new Map<string, SourceShot>(
    plan.source_shots.map((s) => [s.shot_id, s])
  );

  // Build video clips track
  const videoClips = plan.timeline.map((entry) => {
    const shot = shotMap.get(entry.shot_id)!;
    const duration = entry.trim_out - entry.trim_in;

    const clip: Record<string, unknown> = {
      asset: {
        type: 'video',
        src: `${s3BaseUrl}/${shot.source_file}`,
        trim: entry.trim_in,
        volume: entry.source_audio === 'mute' ? 0 : 1,
      },
      length: duration / (entry.speed ?? 1.0),
      transition: shotstackTransition(entry),
    };

    // Speed adjustment
    if (entry.speed && entry.speed !== 1.0) {
      clip.speed = entry.speed;
    }

    return clip;
  });

  // Build music track (if present)
  const musicClips = (plan.audio?.music ?? []).map((track) => ({
    asset: {
      type: 'audio',
      src: `${s3BaseUrl}/${track.src}`,
      trim: 0,
      volume: 1,
    },
    start: track.start,
    length: track.end - track.start,
  }));

  // Build export settings
  const exportSettings = plan.export_settings ?? {};
  const resolution = resolutionToShotstack(exportSettings.resolution ?? '1080p');

  return {
    timeline: {
      soundtrack: musicClips.length > 0
        ? { src: `${s3BaseUrl}/${plan.audio?.music?.[0]?.src}`, effect: 'fadeOut' }
        : undefined,
      tracks: [
        { clips: videoClips },
        ...(musicClips.length > 0 ? [{ clips: musicClips }] : []),
      ],
    },
    output: {
      format: exportSettings.container ?? 'mp4',
      resolution,
      fps: exportSettings.fps ?? 30,
      quality: 'high',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map EditPlan transition types to Shotstack transition objects */
function shotstackTransition(entry: TimelineEntry): Record<string, unknown> | undefined {
  if (!entry.transition_in || entry.transition_in === 'hard_cut') return undefined;

  const duration = entry.transition_duration ?? 0.5;

  const transitionMap: Record<string, string> = {
    crossfade:    'fade',
    dissolve:     'fade',
    fade_in:      'fade',
    fade_out:     'fade',
    wipe_left:    'slideLeft',
    wipe_right:   'slideRight',
    dip_to_black: 'fade',
    dip_to_white: 'fade',
  };

  const effect = transitionMap[entry.transition_in];
  if (!effect) return undefined;

  return { in: effect, duration };
}

/** Map resolution string to Shotstack resolution identifier */
function resolutionToShotstack(resolution: string): string {
  const map: Record<string, string> = {
    '720p':  'hd',
    '1080p': 'hd',
    '1440p': '2k',
    '4k':    '4k',
  };
  return map[resolution] ?? 'hd';
}
