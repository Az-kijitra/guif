//! R-15-5 / R-15-6: which CF_HDROP paths are adopted. Pure (SPEC-0200-0001 §3.10.7).
//! The same acceptance table as the TypeScript `path-bar/normalize.ts` (SPEC-0300-0016 R-722 /
//! R-795-2); the two cannot share code, `paths_tests.rs` holds the representative values.

use std::collections::HashSet;

/// 32,767 UTF-16 units (R-15-5, CB-02).
pub const MAX_PATH_UTF16: usize = 32_767;

fn is_drive_prefix(chars: &[char]) -> bool {
    chars.len() >= 3 && chars[0].is_ascii_alphabetic() && chars[1] == ':' && chars[2] == '\\'
}

/// `{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}`-shaped (braces around a GUID-like body).
fn is_volume_guid(component: &str) -> bool {
    let Some(rest) = component.strip_prefix("Volume") else { return false };
    let Some(inner) = rest.strip_prefix('{').and_then(|r| r.strip_suffix('}')) else { return false };
    let groups: Vec<&str> = inner.split('-').collect();
    let lens = [8usize, 4, 4, 4, 12];
    groups.len() == 5
        && groups.iter().zip(lens).all(|(g, n)| g.len() == n && g.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Absolute-path forms only (SPEC-0300-0016 R-722 / R-795-2). Never converts.
pub fn is_adoptable(path: &str) -> bool {
    if path.is_empty() || path.encode_utf16().count() > MAX_PATH_UTF16 {
        return false;
    }
    if let Some(rest) = path.strip_prefix(r"\\?\") {
        return !rest.is_empty();
    }
    if let Some(rest) = path.strip_prefix(r"\\.\") {
        let chars: Vec<char> = rest.chars().collect();
        if is_drive_prefix(&chars) {
            return true;
        }
        let first = rest.split('\\').next().unwrap_or("");
        // `\\.\Volume{GUID}\...`: the trailing `\` must exist (otherwise it names the device itself).
        return rest.len() > first.len() && is_volume_guid(first);
    }
    if let Some(rest) = path.strip_prefix(r"\\") {
        // UNC: \\server\share[\...] — a non-empty server and a non-empty share.
        let mut parts = rest.split('\\');
        let server = parts.next().unwrap_or("");
        let share = parts.next().unwrap_or("");
        return !server.is_empty() && !share.is_empty();
    }
    let chars: Vec<char> = path.chars().collect();
    is_drive_prefix(&chars)
}

/// Filters with `is_adoptable`, then keeps the FIRST of paths equal under
/// `str::to_lowercase()` (R-15-6, CB-04). Order kept, strings unchanged.
pub fn adopt_paths(raw: Vec<String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for p in raw {
        if !is_adoptable(&p) {
            continue;
        }
        if seen.insert(p.to_lowercase()) {
            out.push(p);
        }
    }
    out
}
