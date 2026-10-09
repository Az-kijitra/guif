// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/path-bar/`. Pure strings and pure templates only.
import { REGION_NAMES } from "$lib/shared/messages";

export const PATH_BAR_MESSAGES = {
  inputLabel: REGION_NAMES.path, // W-07 (aria-label of the input): the same word as the status-bar region name (P2)
  noCandidates: "候補がありません。",
  ambiguousCandidates: (count: number): string => `候補が${count}件あります。`, // R-744-1
} as const;
