import { z } from 'zod';
import { TRANSITIONS, SOURCE_AUDIO_MODES, OVERLAY_POSITIONS, OVERLAY_STYLES, SHOT_ROLES, RESOLUTIONS, CODECS, CONTAINERS, FPS_VALUES, LIMITS } from '../constants';

export const gainPointSchema = z.object({ t: z.number(), db: z.number() });
export const musicTrackSchema = z.object({ id: z.string(), src: z.string(), start: z.number(), end: z.number(), gain_curve_db: z.array(gainPointSchema).optional(), loop: z.boolean().default(false), fade_in: z.number().min(0).default(0), fade_out: z.number().min(0).default(0) });
export const sfxEventSchema = z.object({ id: z.string(), src: z.string(), at: z.number(), gain_db: z.number().default(0) });
export const voiceoverTrackSchema = z.object({ id: z.string(), src: z.string(), start: z.number(), end: z.number(), gain_db: z.number().default(0) });
export const audioExportSettingsSchema = z.object({ loudness_target_lufs: z.number().default(LIMITS.DEFAULT_LOUDNESS_LUFS), true_peak_db: z.number().default(LIMITS.DEFAULT_TRUE_PEAK_DB), sample_rate: z.number().int().default(LIMITS.DEFAULT_SAMPLE_RATE), channels: z.union([z.literal(1), z.literal(2)]).default(2) });
export const audioMixSchema = z.object({ music: z.array(musicTrackSchema).optional(), sfx: z.array(sfxEventSchema).optional(), voiceover: z.array(voiceoverTrackSchema).optional(), export: audioExportSettingsSchema.optional() });

export const sourceShotSchema = z.object({
  shot_id: z.string().regex(/^shot_\d{4,}$/, 'shot_id must match pattern shot_XXXX'),
  source_file: z.string().min(1), start: z.number().min(0), end: z.number().min(0),
  duration: z.number().min(0).optional(), transcript: z.string().optional(),
  tags: z.array(z.string()).optional(), visual_description: z.string().optional(),
  quality_score: z.number().min(LIMITS.QUALITY_SCORE_MIN).max(LIMITS.QUALITY_SCORE_MAX).optional(),
  group_id: z.string().nullable().optional(), role: z.enum(SHOT_ROLES).optional(),
  is_best_take: z.boolean().optional(),
});

export const timelineEntrySchema = z.object({
  shot_id: z.string().regex(/^shot_\d{4,}$/, 'shot_id must match pattern shot_XXXX'),
  trim_in: z.number().min(0), trim_out: z.number().min(0),
  transition_in: z.enum(TRANSITIONS),
  transition_duration: z.number().min(0).max(LIMITS.TRANSITION_DURATION_MAX).default(0),
  source_audio: z.enum(SOURCE_AUDIO_MODES).default('keep'),
  speed: z.number().min(LIMITS.SPEED_MIN).max(LIMITS.SPEED_MAX).default(1.0),
  overlay_text: z.string().max(LIMITS.OVERLAY_TEXT_MAX_LENGTH).nullable().optional(),
  overlay_position: z.enum(OVERLAY_POSITIONS).default('lower_third'),
  overlay_style: z.enum(OVERLAY_STYLES).default('default'),
  agent_notes: z.string().optional(),
});

export const exportSettingsSchema = z.object({
  resolution: z.enum(RESOLUTIONS).default('1080p'),
  fps: z.number().refine((v) => (FPS_VALUES as readonly number[]).includes(v), 'Invalid FPS').default(30),
  codec: z.enum(CODECS).default('h264'),
  container: z.enum(CONTAINERS).default('mp4'),
  bitrate_mbps: z.number().positive().default(LIMITS.DEFAULT_BITRATE_MBPS),
});

export const planMetadataSchema = z.object({ title: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() });

export const editPlanSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver'),
  project_id: z.string().uuid(), created_at: z.string().datetime(),
  revision: z.number().int().min(1), parent_revision: z.number().int().min(1).nullable(),
  source_shots: z.array(sourceShotSchema).min(1, 'source_shots must not be empty'),
  timeline: z.array(timelineEntrySchema).min(1, 'timeline must not be empty'),
  audio: audioMixSchema, export_settings: exportSettingsSchema.optional(),
  metadata: planMetadataSchema.optional(),
});

export type EditPlanInput = z.input<typeof editPlanSchema>;
export type EditPlanOutput = z.output<typeof editPlanSchema>;
