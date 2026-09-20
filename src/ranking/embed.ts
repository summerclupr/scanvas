/**
 * Semantic interest matching.
 *
 * Keyword matching alone fails on exactly the cases that matter: a student who
 * typed "machine learning" should be shown a talk on "foundation models for
 * robot manipulation", which shares no keyword with their interests. So field
 * interests and events both get embedded by the local embedding model and
 * compared by cosine similarity.
 *
 * Embeddings are cached by content hash - the embedding model is fast, but
 * re-embedding every event on every render would still be wasteful, and this
 * makes scoring synchronous once the cache is warm.
 */

import { contentHash } from '../core/datetime';
import type { UnifiedEvent } from '../core/types';
import { embed, type OllamaConfig } from '../llm/ollama';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * The text we embed for an event. Deliberately NOT the full description:
 * boilerplate ("refreshments served", "hosted by") dilutes the subject signal.
 * Title plus extracted topics plus organizer is the dense part.
 */
export function embeddingText(ev: UnifiedEvent): string {
  return [ev.title, ev.topics.join(', '), ev.organizer, ev.people.join(', ')]
    .filter(Boolean)
    .join('. ');
}

/**
 * nomic-embed-text is a task-prefixed model: it expects "search_query: " on
 * the thing you're looking for and "search_document: " on the thing being
 * searched. Omitting these is not a small quality loss - without them every
 * pair landed in a narrow 0.45-0.55 band and the field signal was
 * indistinguishable from noise. Interests are queries, events are documents.
 */
export type EmbedRole = 'query' | 'document';

const PREFIX: Record<EmbedRole, string> = {
  query: 'search_query: ',
  document: 'search_document: ',
};

/** Other models don't use prefixes and are hurt by them. */
function needsPrefix(model: string): boolean {
  return /nomic-embed/i.test(model);
}

export class EmbeddingCache {
  private store = new Map<string, number[]>();

  constructor(initial?: Record<string, number[]>) {
    if (initial) for (const [k, v] of Object.entries(initial)) this.store.set(k, v);
  }

  private key(text: string, role: EmbedRole): string {
    return contentHash(role, text);
  }

  get(text: string, role: EmbedRole = 'document'): number[] | undefined {
    return this.store.get(this.key(text, role));
  }

  has(text: string, role: EmbedRole = 'document'): boolean {
    return this.store.has(this.key(text, role));
  }

  set(text: string, vec: number[], role: EmbedRole = 'document'): void {
    this.store.set(this.key(text, role), vec);
  }

  /** Embed whatever isn't cached yet, in one batched call per role. */
  async warm(
    cfg: OllamaConfig,
    texts: string[],
    role: EmbedRole = 'document',
  ): Promise<void> {
    const missing = [...new Set(texts.filter((t) => t && !this.has(t, role)))];
    if (missing.length === 0) return;
    const prefix = needsPrefix(cfg.embedModel) ? PREFIX[role] : '';
    const vectors = await embed(cfg, missing.map((t) => prefix + t));
    missing.forEach((t, i) => {
      if (vectors[i]) this.set(t, vectors[i], role);
    });
  }

  toJSON(): Record<string, number[]> {
    return Object.fromEntries(this.store);
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Best match between an event and any single interest, not the average.
 *
 * Averaging is wrong here: a student interested in both "synthetic biology"
 * and "quantum computing" is fully interested in a pure quantum talk, and
 * averaging against the unrelated bio vector would halve its score.
 */
export function bestFieldMatch(
  eventVec: number[] | undefined,
  fieldVecs: { field: string; vec: number[] }[],
): { field: string; similarity: number } | null {
  if (!eventVec || fieldVecs.length === 0) return null;
  let best: { field: string; similarity: number } | null = null;
  for (const { field, vec } of fieldVecs) {
    const similarity = cosine(eventVec, vec);
    if (!best || similarity > best.similarity) best = { field, similarity };
  }
  return best;
}

/**
 * Map raw cosine onto a usable 0..1 signal.
 *
 * Cosine never reaches 0 for unrelated text, so the raw number is unusable as
 * a score. These bounds were measured, not guessed: against the fixture set
 * with prefixes applied, genuinely related events land at 0.63-0.82 and
 * unrelated ones at 0.53-0.57. A floor of 0.60 sits in that gap, so unrelated
 * events contribute exactly nothing.
 *
 * Re-measure with `npm run calibrate` if you change the embedding model - the
 * gap moves, and on a model without task prefixes it closes entirely.
 */
export function similarityToScore(sim: number, floor = 0.6, ceil = 0.8): number {
  if (sim <= floor) return 0;
  if (sim >= ceil) return 1;
  return (sim - floor) / (ceil - floor);
}
