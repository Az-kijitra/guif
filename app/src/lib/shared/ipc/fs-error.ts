// Split out of fs.ts (SPEC-0200-0001 §3.7.10.2): the error type/normalizer has
// no Tauri dependency, so `features/file-list/list-state.svelte.ts` can
// import it directly while tests mock `./fs` (the invoke wrappers) only.
// `./fs` re-exports everything here, so existing importers are unaffected.

// SPEC-0200-0001 §3.6.11.6 (MUST-89, §19 第15回 MUST-95): `fs_list_dir`'s
// backend error is now a structured `{code, message}` DTO. Tauri's `invoke()`
// rejects with that DTO as-is, so it is normalized into a real `Error`
// subclass here (the same precedent `shared/ipc/archive.ts`'s `ArchiveError`/
// `normalizeArchiveError` set) — otherwise `list-state.svelte.ts`'s existing
// `e instanceof Error ? e.message : String(e)` catch clause would display
// "[object Object]".
export type FsListDirErrorCode = "access_denied" | "not_found" | "not_a_directory" | "invalid_path" | "other";

export class FsListDirError extends Error {
  code: FsListDirErrorCode;

  constructor(code: FsListDirErrorCode, message: string) {
    super(message);
    this.name = "FsListDirError";
    this.code = code;
  }
}

const KNOWN_CODES: readonly FsListDirErrorCode[] = ["access_denied", "not_found", "not_a_directory", "invalid_path", "other"];

// Never throws: any rejected value becomes an FsListDirError. Accepts the 3
// input shapes MUST-95 requires: a structured DTO object, a bare string (an
// ACL-rejection message, or the pre-MUST-89 command shape), or an Error
// instance.
export function normalizeFsListDirError(raw: unknown): FsListDirError {
  if (raw instanceof FsListDirError) return raw;
  if (typeof raw === "string") return new FsListDirError("other", raw);
  if (raw instanceof Error) {
    // An Error that already carries a known `code` (e.g. an FsListDirError
    // from another module instance) keeps it.
    const code = (raw as { code?: unknown }).code;
    return new FsListDirError(KNOWN_CODES.includes(code as FsListDirErrorCode) ? (code as FsListDirErrorCode) : "other", raw.message);
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { code?: unknown; message?: unknown };
    const code = KNOWN_CODES.includes(o.code as FsListDirErrorCode) ? (o.code as FsListDirErrorCode) : "other";
    return new FsListDirError(code, typeof o.message === "string" ? o.message : "");
  }
  return new FsListDirError("other", String(raw));
}
