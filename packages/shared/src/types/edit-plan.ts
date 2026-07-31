import type { Transition, SourceAudioMode, OverlayPosition, OverlayStyle, ShotRole, Resolution, Codec, Container } from '../constants';
import type { AudioMix } from './audio';

export interface SourceShot {
  shot_id: string;
  source_file: string;
  start: number;
  end: number;
  duration?: number;
  transcript?: string;
  tags?: string[];
  visual_description?: string;
  quality_score?: number;
  group_id?: string | null;
  role?: ShotRole;
  is_best_take?: boolean;
}

export interface TimelineEntry {
  shot_id: string;
  trim_in: number;
  trim_out: number;
  transition_in: Transition;
  transition_duration?: number;
  source_audio?: SourceAudioMode;
  speed?: number;
  overlay_text?: string | null;
  overlay_position?: OverlayPosition;
  overlay_style?: OverlayStyle;
  agent_notes?: string;
}

export interface ExportSettings {
  resolution?: Resolution;
  fps?: number;
  codec?: Codec;
  container?: Container;
  bitrate_mbps?: number;
}

export interface PlanMetadata {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface EditPlan {
  version: string;
  project_id: string;
  created_at: string;
  revision: number;
  parent_revision: number | null;
  source_shots: SourceShot[];
  timeline: TimelineEntry[];
  audio: AudioMix;
  export_settings?: ExportSettings;
  metadata?: PlanMetadata;
}
