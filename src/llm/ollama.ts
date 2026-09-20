/**
 * Minimal Ollama client.
 *
 * Runs against a local Ollama server — on the laptop over LAN in dev, or
 * localhost if you're on a simulator. No request ever leaves the network, which
 * is the entire point: this app reads your email and your coursework.
 */

export interface OllamaConfig {
  /** e.g. "http://192.168.1.42:11434" — your laptop on the dorm wifi. */
  host: string;
  /** Instruct model used for extraction + rationales. */
  chatModel: string;
  /** Embedding model used for interest matching. */
  embedModel: string;
  /** Per-request timeout. Local models on a laptop can be slow. */
  timeoutMs: number;
}

export const DEFAULT_OLLAMA: OllamaConfig = {
  host: 'http://localhost:11434',
  chatModel: 'qwen3.5:9b',
  embedModel: 'nomic-embed-text',
  timeoutMs: 90_000,
};

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

async function post<T>(
  cfg: OllamaConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OllamaError(`${path} returned ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof OllamaError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new OllamaError(`${path} timed out after ${cfg.timeoutMs}ms`);
    }
    throw new OllamaError(`Cannot reach Ollama at ${cfg.host}`, err);
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat with an optional JSON Schema. Passing a schema makes Ollama constrain
 * decoding to valid JSON of that shape, which removes ~all parse failures.
 *
 * `think` defaults to false, and that is not a detail. On qwen3:4b, leaving
 * reasoning on made a single event extraction take 45-75 seconds and produced
 * WORSE output (it reasoned its way into inventing absolute dates). Turning it
 * off took the same extraction to 1.3 seconds. Every model in this app is used
 * for short structured extraction, which is exactly the shape that gains
 * nothing from a scratchpad.
 */
export async function chat(
  cfg: OllamaConfig,
  messages: ChatMessage[],
  opts: {
    schema?: object;
    temperature?: number;
    model?: string;
    think?: boolean;
  } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model ?? cfg.chatModel,
    messages,
    stream: false,
    think: opts.think ?? false,
    options: { temperature: opts.temperature ?? 0 },
  };
  if (opts.schema) body.format = opts.schema;

  let out: { message?: { content?: string } };
  try {
    out = await post<{ message?: { content?: string } }>(cfg, '/api/chat', body);
  } catch (err) {
    // Older Ollama builds reject `think` outright instead of ignoring it on
    // models that don't reason. Retry once without the field.
    if (/think/i.test((err as Error).message)) {
      delete body.think;
      out = await post<{ message?: { content?: string } }>(cfg, '/api/chat', body);
    } else {
      throw err;
    }
  }
  return out.message?.content ?? '';
}

/** Chat, parsed as JSON. Throws OllamaError on malformed output. */
export async function chatJSON<T>(
  cfg: OllamaConfig,
  messages: ChatMessage[],
  schema: object,
  opts: { temperature?: number; model?: string } = {},
): Promise<T> {
  const text = await chat(cfg, messages, { ...opts, schema });
  try {
    return JSON.parse(stripThinking(text)) as T;
  } catch (err) {
    throw new OllamaError(`Model returned non-JSON: ${text.slice(0, 200)}`, err);
  }
}

/**
 * Reasoning models (qwen3, deepseek-r1) emit a <think> block before the answer
 * even under a JSON schema in some versions. Drop it.
 */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Batch embeddings. Returns one vector per input, in order. */
export async function embed(
  cfg: OllamaConfig,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out = await post<{ embeddings?: number[][] }>(cfg, '/api/embed', {
    model: cfg.embedModel,
    input: texts,
  });
  if (!out.embeddings) throw new OllamaError('No embeddings in response');
  return out.embeddings;
}

/**
 * Is `want` among the installed models?
 *
 * Compares the model NAME and TAG separately rather than by string prefix.
 * Prefix matching looked fine until a dot-versioned name appeared:
 * "qwen3.5:9b".startsWith("qwen3") is true, so with only qwen3:4b installed
 * the app cheerfully reported qwen3.5:9b as available, showed "Connected",
 * and then every single extraction 404'd. A tag-less request ("qwen3") still
 * matches any tag of that exact model, which is what the prefix check was
 * actually for.
 */
export function hasModel(installed: string[], want: string): boolean {
  const [wantName, wantTag] = want.split(':');
  return installed.some((m) => {
    const [name, tag] = m.split(':');
    if (name !== wantName) return false;
    return !wantTag || wantTag === tag;
  });
}

/** Is the server up and are the models we need pulled? */
export async function health(cfg: OllamaConfig): Promise<{
  reachable: boolean;
  models: string[];
  missing: string[];
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${cfg.host}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { reachable: false, models: [], missing: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    const want = [cfg.chatModel, cfg.embedModel];
    const missing = want.filter((w) => !hasModel(models, w));
    return { reachable: true, models, missing };
  } catch (err) {
    return {
      reachable: false,
      models: [],
      missing: [],
      error: (err as Error).message,
    };
  }
}
