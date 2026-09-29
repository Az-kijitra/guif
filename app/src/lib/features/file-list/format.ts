// SPEC-0300-0009 R-20-11/R-20-12/R-71 (注記)/AC-620/AC-621. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.7. Pure, DOM-independent
// display-formatting helpers for `FileListRow.svelte` (the underlying
// `Entry.size`/`Entry.modified` values themselves are unchanged, R-20-12
// second half).

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// R-20-11/AC-620: the smallest unit under which the value is below 1024,
// rounded to one decimal (B stays an integer). Never rounds up into
// displaying "1024.0 <unit>": a value that rounds up to 1024 at a given unit
// carries to the next unit instead.
export function formatSize(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${Math.round(value)} B`;
  }
  let rounded = Math.round(value * 10) / 10;
  if (rounded >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    rounded /= 1024;
    unitIndex += 1;
  }
  return `${rounded.toFixed(1)} ${SIZE_UNITS[unitIndex]}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// R-20-12/R-71 注記/AC-621: `modified` is a 20-digit zero-padded UNIX-epoch-
// seconds string; "0" (all zeros, pre-1970/unavailable) or anything
// unparseable displays as blank. Uses the LOCAL time zone.
export function formatModifiedForDisplay(modified: string): string {
  if (!/^\d+$/.test(modified)) return "";
  const epochSeconds = Number(modified);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return "";
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}
