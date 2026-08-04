import { config } from '../config.js';
import { logger } from '../middleware/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Base URL — stage for testing (free), v1 for production
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL =
  config.SHOTSTACK_ENV === 'v1'
    ? 'https://api.shotstack.io/v1'
    : 'https://api.shotstack.io/stage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type ShotstackStatus =
  | 'queued'
  | 'fetching'
  | 'rendering'
  | 'saving'
  | 'done'
  | 'failed';

export interface ShotstackRenderResponse {
  renderId: string;
  status: ShotstackStatus;
  url?: string;           // available when status === 'done'
  error?: string;         // available when status === 'failed'
  duration?: number;      // output video duration in seconds
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getHeaders(): HeadersInit {
  if (!config.SHOTSTACK_API_KEY) {
    throw new Error(
      'SHOTSTACK_API_KEY is not set. Add it to your .env file to use cloud rendering.'
    );
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.SHOTSTACK_API_KEY,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Submit a render job to Shotstack
// ─────────────────────────────────────────────────────────────────────────────
export async function submitRender(
  timeline: Record<string, unknown>
): Promise<string> {
  logger.info({ env: config.SHOTSTACK_ENV }, 'Submitting render to Shotstack');

  const response = await fetch(`${BASE_URL}/render`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(timeline),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shotstack submit failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    message: string;
    response: { id: string; message: string; status: string };
  };

  const renderId = data.response.id;
  logger.info({ renderId }, 'Shotstack render submitted');
  return renderId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Poll a render job for its current status
// ─────────────────────────────────────────────────────────────────────────────
export async function getRenderStatus(
  renderId: string
): Promise<ShotstackRenderResponse> {
  const response = await fetch(`${BASE_URL}/render/${renderId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shotstack status check failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    response: {
      id: string;
      status: ShotstackStatus;
      url?: string;
      error?: string;
      data?: { output?: { duration?: number } };
    };
  };

  return {
    renderId: data.response.id,
    status: data.response.status,
    url: data.response.url,
    error: data.response.error,
    duration: data.response.data?.output?.duration,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Submit and wait for completion (polls every interval until done/failed)
// ─────────────────────────────────────────────────────────────────────────────
export async function submitAndWait(
  timeline: Record<string, unknown>,
  options: {
    pollIntervalMs?: number;  // how often to poll (default 5000ms)
    timeoutMs?: number;       // max wait time (default 10 minutes)
  } = {}
): Promise<ShotstackRenderResponse> {
  const { pollIntervalMs = 5000, timeoutMs = 10 * 60 * 1000 } = options;

  const renderId = await submitRender(timeline);
  const startedAt = Date.now();

  logger.info({ renderId, pollIntervalMs, timeoutMs }, 'Polling Shotstack render');

  while (true) {
    await sleep(pollIntervalMs);

    const result = await getRenderStatus(renderId);
    logger.debug({ renderId, status: result.status }, 'Shotstack poll');

    if (result.status === 'done') {
      logger.info({ renderId, url: result.url }, 'Shotstack render complete');
      return result;
    }

    if (result.status === 'failed') {
      throw new Error(`Shotstack render failed: ${result.error ?? 'unknown error'}`);
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Shotstack render timed out after ${timeoutMs / 1000}s (renderId: ${renderId})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
