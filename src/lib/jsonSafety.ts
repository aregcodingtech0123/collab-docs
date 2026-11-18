// Checks that keep hostile-but-valid JSON from reaching the database.
//
// PostgreSQL cannot store the NUL character (U+0000) in `text` or `jsonb`, nor unpaired
// UTF-16 surrogates; trying to makes the query throw, which would be a 500 for what is just
// bad input. Absurdly deep nesting is rejected too: no real document needs it and it can
// overflow the stack of whatever walks the tree later (the editor, a serializer).

/** Deepest nesting we accept in document content (about 15 levels of nested lists; real documents use 1-3). */
export const MAX_CONTENT_DEPTH = 64;

// An unpaired high surrogate, or a low surrogate with no high one before it.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** True for text the database cannot store: NUL or an unpaired surrogate. */
export function isUnstorableText(text: string): boolean {
  return text.includes("\u0000") || LONE_SURROGATE.test(text);
}

export interface JsonInspection {
  /** Some string value or object key contains text the database cannot store. */
  unstorableText: boolean;
  /** Nesting is deeper than the limit. */
  tooDeep: boolean;
}

/** Walks a parsed JSON value iteratively (a deep tree cannot overflow the stack here). */
export function inspectJson(root: unknown, maxDepth = MAX_CONTENT_DEPTH): JsonInspection {
  const result: JsonInspection = { unstorableText: false, tooDeep: false };
  const stack: [unknown, number][] = [[root, 1]];

  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (typeof value === "string") {
      if (isUnstorableText(value)) result.unstorableText = true;
    } else if (value !== null && typeof value === "object") {
      if (depth > maxDepth) {
        result.tooDeep = true;
        return result;
      }
      if (Array.isArray(value)) {
        for (const item of value) stack.push([item, depth + 1]);
      } else {
        for (const [key, item] of Object.entries(value)) {
          if (isUnstorableText(key)) result.unstorableText = true;
          stack.push([item, depth + 1]);
        }
      }
    }
  }
  return result;
}
