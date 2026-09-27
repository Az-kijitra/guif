// SPEC-0300-0015 R-409, R-431 (SPEC-0200-0001 §3.5.12.2, MUST-74/81): the
// same increment-and-compare freshness guard already inlined in
// `list-state.svelte.ts`'s `loadDirectory` (`let loadSequence = 0; const
// mySequence = ++loadSequence; ...; if (mySequence !== loadSequence) return
// null;`), extracted into a small reusable pure object so
// `viewer-controller.ts` can gate `viewer_open`/`viewer_navigate`/
// `viewer_read_*` responses the same way: a slow earlier request's result
// must never overwrite a faster later one's (AC-411).

export interface RequestSequencer {
  /** Mints a new, strictly increasing token. */
  begin(): number;
  /** True only for the LATEST token minted by this sequencer. */
  isCurrent(token: number): boolean;
}

export function createRequestSequencer(): RequestSequencer {
  let latest = 0;

  return {
    begin(): number {
      latest += 1;
      return latest;
    },
    isCurrent(token: number): boolean {
      return token === latest;
    },
  };
}
