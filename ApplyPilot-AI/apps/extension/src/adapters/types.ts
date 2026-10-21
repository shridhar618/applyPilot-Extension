import type { ExtractedJob } from "@applypilot/shared-types";

export type { ExtractedJob };
/** An adapter inspects a Document and returns whatever it can find, or null. It must never throw. */
export interface JobAdapter {
  name: string;
  matches(url: URL): boolean;
  extract(doc: Document, url: URL): Partial<ExtractedJob> | null;
}
export const MIN_DESCRIPTION_CHARS = 200;
