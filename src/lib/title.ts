// Document title rules, shared by the client (RenameTitle) and the server (zod schema).

export const MAX_TITLE_LENGTH = 200;

export type TitleResult = { ok: true; value: string } | { ok: false; message: string };

/** Trim, then require 1..MAX_TITLE_LENGTH characters. */
export function validateTitle(raw: string): TitleResult {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: "A title can't be empty." };
  if (value.length > MAX_TITLE_LENGTH) {
    return { ok: false, message: `A title can be at most ${MAX_TITLE_LENGTH} characters.` };
  }
  return { ok: true, value };
}
