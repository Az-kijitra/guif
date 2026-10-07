//! R-15-5 / R-15-6: which CF_HDROP paths are adopted. Pure (SPEC-0200-0001 §3.10.7).
//! The judgement itself is `shared::abs_path::is_absolute_path` (SPEC-0300-0011 R-89-6, the one
//! implementation); the TypeScript `path-bar/normalize.ts` holds the same acceptance table.

use std::collections::HashSet;

use crate::shared::abs_path;

/// Filters with `abs_path::is_absolute_path`, then keeps the FIRST of paths equal under
/// `str::to_lowercase()` (R-15-6, CB-04). Order kept, strings unchanged.
pub fn adopt_paths(raw: Vec<String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for p in raw {
        if !abs_path::is_absolute_path(&p) {
            continue;
        }
        if seen.insert(p.to_lowercase()) {
            out.push(p);
        }
    }
    out
}
