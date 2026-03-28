const TINYFISH_BASE_URL = 'https://agent.tinyfish.ai/v1';
const TINYFISH_API_KEY_STORAGE_KEY = 'tinyfishApiKey';

export type TinyFishStepEvent = {
  type: string;
  step_number?: number;
  description?: string;
  [key: string]: unknown;
};

export type TinyFishRunResult<TData = unknown> = {
  success: boolean;
  data: TData | null;
  screenshotUrl: string | null;
  error: string | null;
  steps: TinyFishStepEvent[];
};

export type TinyFishRunParams = {
  url: string;
  goal: string;
  session?: string | null;
  extract?: Record<string, unknown>;
};

const getStorageValue = async <T>(key: string) => {
  const items = await chrome.storage.local.get(key);
  return (items[key] as T | undefined) ?? null;
};

export const getTinyFishApiKey = async () => {
  const apiKey = await getStorageValue<string>(TINYFISH_API_KEY_STORAGE_KEY);
  if (!apiKey) {
    throw new Error('TinyFish API key is missing. Save it in the popup before starting a run.');
  }

  return apiKey;
};

export const hasTinyFishApiKey = async () => Boolean(await getStorageValue<string>(TINYFISH_API_KEY_STORAGE_KEY));

export const saveTinyFishApiKey = async (apiKey: string) => {
  const trimmedApiKey = apiKey.trim();
  await chrome.storage.local.set({
    [TINYFISH_API_KEY_STORAGE_KEY]: trimmedApiKey,
  });
  return trimmedApiKey;
};

export class TinyFishError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'TinyFishError';
    this.statusCode = statusCode;
  }
}

const parseSseStream = async <TData>(
  readableStream: ReadableStream<Uint8Array>,
  onProgress?: (step: number, message: string) => void | Promise<void>,
) => {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result: TinyFishRunResult<TData> = {
    success: false,
    data: null,
    screenshotUrl: null,
    error: null,
    steps: [],
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }

      const rawPayload = line.slice(6).trim();
      if (!rawPayload || rawPayload === '[DONE]') {
        continue;
      }

      try {
        const event = JSON.parse(rawPayload) as TinyFishStepEvent & {
          success?: boolean;
          extracted_data?: TData;
          screenshot_url?: string;
          error?: string;
        };
        result.steps.push(event);

        if (event.type === 'step' && typeof event.step_number === 'number' && event.description) {
          await onProgress?.(event.step_number, event.description);
        }

        if (event.type === 'complete') {
          result.success = Boolean(event.success);
          result.data = (event.extracted_data ?? null) as TData | null;
          result.screenshotUrl = typeof event.screenshot_url === 'string' ? event.screenshot_url : null;
          result.error = typeof event.error === 'string' ? event.error : null;
        }
      } catch {
        // Ignore non-JSON lines or heartbeat events.
      }
    }
  }

  return result;
};

export const runAgent = async <TData = unknown>(
  params: TinyFishRunParams,
  onProgress?: (step: number, message: string) => void | Promise<void>,
) => {
  const apiKey = await getTinyFishApiKey();
  const body = {
    url: params.url,
    goal: params.goal,
    ...(params.session ? { session: params.session } : {}),
    ...(params.extract ? { extract: params.extract } : {}),
  };

  const response = await fetch(`${TINYFISH_BASE_URL}/automation/run-sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new TinyFishError(
      response.status,
      payload.message ?? payload.error ?? `TinyFish request failed with status ${response.status}.`,
    );
  }

  if (!response.body) {
    throw new TinyFishError(response.status, 'TinyFish returned an empty response body.');
  }

  return parseSseStream<TData>(response.body, onProgress);
};
