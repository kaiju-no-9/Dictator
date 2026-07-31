export const TRANSITIONS = ['hard_cut','crossfade','dissolve','fade_in','fade_out','wipe_left','wipe_right','dip_to_black','dip_to_white'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const SOURCE_AUDIO_MODES = ['keep', 'mute', 'replace'] as const;
export type SourceAudioMode = (typeof SOURCE_AUDIO_MODES)[number];

export const OVERLAY_POSITIONS = ['top', 'center', 'bottom', 'lower_third'] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export const OVERLAY_STYLES = ['default', 'bold', 'subtitle', 'title_card'] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];

export const SHOT_ROLES = ['primary','alternate_take','b_roll','cutaway','establishing','reaction'] as const;
export type ShotRole = (typeof SHOT_ROLES)[number];

export const RESOLUTIONS = ['720p', '1080p', '1440p', '4k'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const FPS_VALUES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;

export const CODECS = ['h264', 'h265', 'prores'] as const;
export type Codec = (typeof CODECS)[number];

export const CONTAINERS = ['mp4', 'mov', 'mkv'] as const;
export type Container = (typeof CONTAINERS)[number];

export const LIMITS = {
  TRANSITION_DURATION_MAX: 5.0,
  SPEED_MIN: 0.1,
  SPEED_MAX: 10.0,
  QUALITY_SCORE_MIN: 1,
  QUALITY_SCORE_MAX: 5,
  OVERLAY_TEXT_MAX_LENGTH: 200,
  TIMELINE_DURATION_MIN: 1,
  TIMELINE_DURATION_MAX: 14400,
  DEFAULT_LOUDNESS_LUFS: -14,
  DEFAULT_TRUE_PEAK_DB: -1.0,
  DEFAULT_SAMPLE_RATE: 48000,
  DEFAULT_BITRATE_MBPS: 10,
} as const;

export const PROJECT_STATUSES = ['created','uploading','processing','planned','editing','rendering','completed','failed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const JOB_STATUSES = ['queued','running','completed','failed','cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PIPELINE_STAGES = ['ingestion','shot_detection','transcription','enrichment','dedup','planning','agent_validation','system_validation','draft_render','critique'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PLAN_SOURCES = ['agent', 'human', 'critique'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const MEDIA_STATUSES = ['uploaded','transcoding','processed','failed'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const ALLOWED_VIDEO_MIMES = new Set(['video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm']);
