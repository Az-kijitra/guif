// SPEC-0300-0017 R-949 / SPEC-0200-0001 §3.8.5: file-name elision that keeps the
// extension visible. Pure (DOM-free); the text-width function is injected.

export type MeasureText = (text: string) => number;

export interface EllipsizeInput {
  name: string;
  ext: string;
  isDir: boolean;
  avail: number;
}

const ELLIPSIS = "…";

// Largest n in [lo, hi] for which `fits(n)` holds (monotone: true then false); lo - 1 when none.
function largestFitting(lo: number, hi: number, fits: (n: number) => boolean): number {
  let best = lo - 1;
  let left = lo;
  let right = hi;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (fits(mid)) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return best;
}

// R-949: 1) fits -> as is; 3) file with an extension -> first k code points + "…" + "." + ext
// (largest k >= 1); 4) otherwise -> end ellipsis; 5) avail <= 0 -> "…" only.
export function ellipsizeFileName(input: EllipsizeInput, measure: MeasureText): string {
  const { name, ext, isDir, avail } = input;
  if (avail <= 0) return ELLIPSIS;
  if (measure(name) <= avail) return name;

  const chars = Array.from(name);

  const dotExt = "." + ext;
  if (!isDir && ext !== "" && name.toLowerCase().endsWith(dotExt.toLowerCase()) && name.length > dotExt.length) {
    const suffix = name.slice(name.length - dotExt.length);
    const baseChars = Array.from(name.slice(0, name.length - dotExt.length));
    const candidate = (k: number): string => baseChars.slice(0, k).join("") + ELLIPSIS + suffix;
    const k = largestFitting(1, baseChars.length, (n) => measure(candidate(n)) <= avail);
    if (k >= 1) return candidate(k);
  }

  const k = largestFitting(0, chars.length, (n) => measure(chars.slice(0, n).join("") + ELLIPSIS) <= avail);
  return chars.slice(0, Math.max(0, k)).join("") + ELLIPSIS;
}
