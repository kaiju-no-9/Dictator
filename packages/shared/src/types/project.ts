import type { ProjectStatus, MediaStatus } from '../constants';

export interface Project {
  id: string; title: string; description?: string | null; status: ProjectStatus;
  created_at: string; updated_at: string;
}

export interface MediaFile {
  id: string; project_id: string; original_filename: string; mime_type: string;
  file_size_bytes: number; duration_seconds?: number | null; width?: number | null;
  height?: number | null; fps?: number | null; s3_raw_key: string;
  s3_processed_key?: string | null; s3_proxy_key?: string | null;
  s3_thumbnail_key?: string | null; status: MediaStatus; created_at: string;
}
