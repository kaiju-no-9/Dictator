import type { JobStatus, PipelineStage } from '../constants';

export interface Job {
  id: string; project_id: string; job_type: string; status: JobStatus; progress: number;
  current_stage?: PipelineStage | null; error_details?: Record<string, unknown> | null;
  started_at?: string | null; completed_at?: string | null; created_at: string;
}

export interface JobEvent {
  id: string; job_id: string; event_type: string; message?: string | null;
  data?: Record<string, unknown> | null; created_at: string;
}

export interface StageStatus { name: PipelineStage; status: 'pending' | 'running' | 'completed' | 'failed'; progress?: number; }

export interface JobStatusResponse { id: string; status: JobStatus; progress: number; current_stage?: PipelineStage | null; stages: StageStatus[]; }
