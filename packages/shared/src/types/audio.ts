export interface GainPoint { t: number; db: number; }

export interface MusicTrack {
  id: string; src: string; start: number; end: number;
  gain_curve_db?: GainPoint[]; loop?: boolean; fade_in?: number; fade_out?: number;
}

export interface SFXEvent { id: string; src: string; at: number; gain_db?: number; }

export interface VoiceoverTrack { id: string; src: string; start: number; end: number; gain_db?: number; }

export interface AudioExportSettings {
  loudness_target_lufs?: number; true_peak_db?: number; sample_rate?: number; channels?: 1 | 2;
}

export interface AudioMix {
  music?: MusicTrack[]; sfx?: SFXEvent[]; voiceover?: VoiceoverTrack[]; export?: AudioExportSettings;
}
