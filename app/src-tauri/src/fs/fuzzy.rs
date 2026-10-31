//! In-app fuzzy search engine (VS Code style Quick Open).
//! Scans a folder recursively and applies fuzzy scoring with match index calculation.

use serde::Serialize;
use std::collections::VecDeque;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyMatchItem {
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub is_dir: bool,
    pub match_indices: Vec<usize>,
    pub score: i32,
}

/// Directories that should never be descended into during fuzzy search.
const IGNORED_DIR_NAMES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "target",
    "dist",
    "build",
    ".cache",
    ".vscode",
    ".idea",
    ".next",
    ".nuxt",
    "venv",
    ".venv",
    "__pycache__",
];

/// Maximum number of filesystem entries visited during a single search.
const MAX_SCAN_LIMIT: usize = 40_000;

/// Tests if a directory name should be skipped (heavy tool folders, whatever the hidden-files setting).
pub fn is_ignored_dir(name: &str) -> bool {
    IGNORED_DIR_NAMES.iter().any(|&ign| ign.eq_ignore_ascii_case(name))
}

/// The list's rule for "hidden" (SPEC-0300-0009 R-74, `fs/query.rs`): the name starts with a dot.
fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

/// Matches `query` against `target` with fuzzy ranking and returns (score, match_indices).
/// If `query` does not match, returns `None`.
pub fn fuzzy_match(target: &str, query: &str) -> Option<(i32, Vec<usize>)> {
    if query.is_empty() {
        return Some((0, Vec::new()));
    }

    let is_smart_case = query.chars().any(|c| c.is_uppercase());

    let target_chars: Vec<char> = target.chars().collect();
    let query_chars: Vec<char> = query.chars().collect();

    // Check if all query characters appear in target in order
    let mut q_idx = 0;
    let mut t_idx = 0;
    let mut indices = Vec::with_capacity(query_chars.len());

    let char_match = |t_char: char, q_char: char| -> bool {
        if is_smart_case {
            t_char == q_char
        } else {
            t_char.to_ascii_lowercase() == q_char.to_ascii_lowercase()
        }
    };

    while q_idx < query_chars.len() && t_idx < target_chars.len() {
        if char_match(target_chars[t_idx], query_chars[q_idx]) {
            indices.push(t_idx);
            q_idx += 1;
        }
        t_idx += 1;
    }

    if q_idx < query_chars.len() {
        return None;
    }

    // Now calculate score
    let mut score = 100i32;

    // Bonus for exact equality
    if target.eq_ignore_ascii_case(query) {
        score += 1000;
    }

    // Identify last path separator to distinguish filename from parent path
    let last_sep_idx = target_chars.iter().rposition(|&c| c == '/' || c == '\\');

    let mut prev_idx: Option<usize> = None;
    for &idx in &indices {
        // 1. Consecutive match bonus
        if let Some(prev) = prev_idx {
            if idx == prev + 1 {
                score += 25;
            }
        }

        // 2. Word boundary bonus
        if idx == 0 {
            score += 30;
        } else {
            let prev_char = target_chars[idx - 1];
            if prev_char == '/' || prev_char == '\\' {
                score += 35; // Start of filename or directory segment
            } else if prev_char == '_' || prev_char == '-' || prev_char == '.' {
                score += 20; // Word separator
            } else if prev_char.is_lowercase() && target_chars[idx].is_uppercase() {
                score += 20; // CamelCase boundary
            }
        }

        // 3. Match in filename bonus (vs match in path prefix)
        if let Some(sep) = last_sep_idx {
            if idx > sep {
                score += 15;
            }
        } else {
            score += 15;
        }

        prev_idx = Some(idx);
    }

    // Penalize long paths to prioritize shorter, tighter matches
    score -= (target_chars.len() as i32) / 2;

    // The screen highlights by JavaScript string position (UTF-16 code units), not by `char`.
    let mut utf16_start = Vec::with_capacity(target_chars.len());
    let mut offset = 0usize;
    for c in &target_chars {
        utf16_start.push(offset);
        offset += c.len_utf16();
    }
    let indices = indices.into_iter().map(|i| utf16_start[i]).collect();

    Some((score, indices))
}

/// Recursively searches for files and directories matching `query` starting from `root`.
/// Returns sorted matches (highest score first) up to `max_results`. Hidden (dot-named) entries are
/// searched only when `show_hidden` is true, the same as the list.
pub fn search_files(root: &Path, query: &str, max_results: usize, show_hidden: bool) -> Vec<FuzzyMatchItem> {
    let mut matches = Vec::new();
    let mut visited = 0usize;

    let mut queue = VecDeque::new();
    queue.push_back(root.to_path_buf());

    let trimmed_query = query.trim();

    while let Some(dir) = queue.pop_front() {
        if visited >= MAX_SCAN_LIMIT {
            break;
        }

        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry_res in entries {
            visited += 1;
            if visited >= MAX_SCAN_LIMIT {
                break;
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_dir = file_type.is_dir();

            if !show_hidden && is_hidden_name(&file_name) {
                continue;
            }
            if is_dir && is_ignored_dir(&file_name) {
                continue;
            }

            let full_path = entry.path();
            // `path` is the navigation target and keeps the native form (`C:\…`, accepted by
            // `abs_path::is_absolute_path`); only the displayed `relative_path` uses `/`.
            let native_path = full_path.to_string_lossy().into_owned();
            let relative = match full_path.strip_prefix(root) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => file_name.clone(),
            };

            if trimmed_query.is_empty() {
                // Empty query: collect shallow files and directories
                let depth = relative.chars().filter(|&c| c == '/').count();
                let score = 1000 - (depth as i32 * 50) - (relative.len() as i32);
                matches.push(FuzzyMatchItem {
                    path: native_path,
                    relative_path: relative,
                    name: file_name,
                    is_dir,
                    match_indices: Vec::new(),
                    score,
                });
            } else if let Some((score, indices)) = fuzzy_match(&relative, trimmed_query) {
                matches.push(FuzzyMatchItem {
                    path: native_path,
                    relative_path: relative,
                    name: file_name,
                    is_dir,
                    match_indices: indices,
                    score,
                });
            }

            if is_dir {
                queue.push_back(full_path);
            }
        }
    }

    // Sort by score descending, then by relative path length ascending, then lexicographically
    matches.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.relative_path.len().cmp(&b.relative_path.len()))
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });

    if matches.len() > max_results {
        matches.truncate(max_results);
    }

    matches
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_match_exact() {
        let (score, indices) = fuzzy_match("main.rs", "main.rs").expect("exact match");
        assert!(score > 1000);
        assert_eq!(indices, vec![0, 1, 2, 3, 4, 5, 6]);
    }

    #[test]
    fn test_fuzzy_match_subsequence() {
        let (score, indices) = fuzzy_match("src/lib/features/keyboard.ts", "kbd").expect("subsequence match");
        assert!(score > 0);
        assert_eq!(indices.len(), 3);
    }

    #[test]
    fn test_fuzzy_match_case_insensitivity() {
        let (score_lower, _) = fuzzy_match("MyComponent.svelte", "mc").expect("case insensitive match");
        let (score_upper, _) = fuzzy_match("MyComponent.svelte", "MC").expect("case sensitive match");
        assert!(score_lower > 0);
        assert!(score_upper > 0);
    }

    #[test]
    fn test_fuzzy_match_no_match() {
        assert!(fuzzy_match("main.rs", "xyz").is_none());
    }

    /// SPEC-0300-0024: a result's `path` is what the list navigates to, so it must pass the same absolute-path
    /// check as `fs_list_dir` (`C:\…`, not `C:/…`). Only `relative_path` (shown on screen) uses `/`.
    #[test]
    fn result_paths_are_native_absolute_paths_and_relative_paths_use_slashes() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir(dir.path().join("sub")).expect("mkdir");
        std::fs::write(dir.path().join("sub").join("note.txt"), b"x").expect("write");
        let found = search_files(dir.path(), "note", 10, false);
        let item = found.iter().find(|m| m.name == "note.txt").expect("note.txt is found");
        assert!(crate::shared::abs_path::is_absolute_path(&item.path), "navigable path: {}", item.path);
        assert!(!item.path.contains('/'), "native separators only: {}", item.path);
        assert_eq!(item.relative_path, "sub/note.txt");
        let sub = search_files(dir.path(), "sub", 10, false);
        let folder = sub.iter().find(|m| m.name == "sub").expect("sub is found");
        assert!(folder.is_dir && crate::shared::abs_path::is_absolute_path(&folder.path), "navigable folder: {}", folder.path);
    }

    /// SPEC-0300-0024: the screen highlights with JavaScript string positions (UTF-16 code units), so a character
    /// outside the BMP before the match must count as 2.
    #[test]
    fn match_indices_are_utf16_positions() {
        let (_, indices) = fuzzy_match("😀ab", "b").expect("match");
        assert_eq!(indices, vec![3]);
        let (_, plain) = fuzzy_match("xab", "b").expect("match");
        assert_eq!(plain, vec![2]);
    }

    /// SPEC-0300-0024: hidden (dot-named) files and folders follow the list's "hidden files" setting;
    /// the heavy folders (`.git`, `node_modules`, ...) are skipped either way.
    #[test]
    fn hidden_entries_follow_the_show_hidden_setting() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join(".env"), b"x").expect("write");
        std::fs::create_dir(dir.path().join(".config")).expect("mkdir");
        std::fs::write(dir.path().join(".config").join("app.toml"), b"x").expect("write");
        std::fs::create_dir(dir.path().join(".git")).expect("mkdir");
        std::fs::write(dir.path().join(".git").join("app.cfg"), b"x").expect("write");
        let names = |show: bool| -> Vec<String> { search_files(dir.path(), "", 50, show).into_iter().map(|m| m.relative_path).collect() };
        let hidden_off = names(false);
        assert!(hidden_off.is_empty(), "nothing dot-named when hidden files are not shown: {hidden_off:?}");
        let hidden_on = names(true);
        assert!(hidden_on.contains(&".env".to_string()), "{hidden_on:?}");
        assert!(hidden_on.contains(&".config/app.toml".to_string()), "{hidden_on:?}");
        assert!(!hidden_on.iter().any(|p| p.starts_with(".git")), "heavy folders stay skipped: {hidden_on:?}");
    }

    #[test]
    fn test_is_ignored_dir() {
        assert!(is_ignored_dir(".git"));
        assert!(is_ignored_dir("node_modules"));
        assert!(is_ignored_dir("target"));
        assert!(!is_ignored_dir("src"));
        assert!(!is_ignored_dir("app"));
    }
}
