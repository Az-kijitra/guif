//! TDD (unit-test-writer, 2026-10-07): AC-89 -- the structure of the absolute-path check, fixed as tables.
//! Specs: SPEC-0300-0011 第9版 R-89 / R-89-1 / R-89-6 / R-89-6-1, AC-89; SPEC-0200-0001 §3.12.8 (a)..(g)
//! (MUST-125 / MUST-126, SHOULD-187, MINOR-10), §3.12.3, §25 guardian findings.
//!
//! A crate-wide wiring test (like `acl_consistency.rs`): it reads the SOURCE of `src/` and checks, for every
//! command that has a path argument,
//! (a) every argument name of every `generate_handler!` command is classified (CHECKED / EXEMPT);
//! (b) the call chain command fn -> ... -> inner layer, and in the inner layer the order of the tokens
//!     `abs_path` -> (resolve) -> E2E scope checks -> the real work, with the absolute-path check before the
//!     first file-system access (honest limit: text scan, helper internals are not followed; the dynamic
//!     "nothing is processed" proof is the behaviour tests `*/guarded_tests.rs`);
//! (c) the judgement exists in ONE place; (d) `.is_absolute()` is used only where the allow-list says;
//! (e) the E2E scope tokens per command (MUST-126) and the meta checks (m1) / (m2);
//! (f) the way the check is written (MINOR-10); SHOULD-187 (`commands -> guarded` one way only).
//! The helpers (`code_only`, `fn_body`, `find_token`) are themselves tested at the bottom.
//!


use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

// =============================================================================================== helpers

fn src_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn read_src(rel: &str) -> String {
    let path = src_root().join(rel);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read src/{rel}: {e}"))
}

fn is_ident(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Comments removed; the CONTENT of string / char literals removed (`""` / `''` stay) so that braces and
/// path-like text inside them cannot confuse the scans. Newlines are kept. Lifetimes (`'a`) are kept.
fn code_only(src: &str) -> String {
    let c: Vec<char> = src.chars().collect();
    let n = c.len();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;
    while i < n {
        let ch = c[i];
        let next = c.get(i + 1).copied();
        if ch == '/' && next == Some('/') {
            while i < n && c[i] != '\n' {
                i += 1;
            }
        } else if ch == '/' && next == Some('*') {
            let mut depth = 0;
            while i < n {
                if c[i] == '/' && c.get(i + 1) == Some(&'*') {
                    depth += 1;
                    i += 2;
                } else if c[i] == '*' && c.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    if c[i] == '\n' {
                        out.push('\n');
                    }
                    i += 1;
                }
            }
        } else if ch == 'r' && (i == 0 || !is_ident(c[i - 1])) && matches!(next, Some('"') | Some('#')) {
            // raw string r"..." / r#"..."#
            let mut j = i + 1;
            let mut hashes = 0;
            while j < n && c[j] == '#' {
                hashes += 1;
                j += 1;
            }
            if j < n && c[j] == '"' {
                j += 1;
                loop {
                    if j >= n {
                        break;
                    }
                    if c[j] == '"' && (0..hashes).all(|k| c.get(j + 1 + k) == Some(&'#')) {
                        j += 1 + hashes;
                        break;
                    }
                    if c[j] == '\n' {
                        out.push('\n');
                    }
                    j += 1;
                }
                out.push_str("\"\"");
                i = j;
            } else {
                out.push(ch);
                i += 1;
            }
        } else if ch == '"' {
            i += 1;
            while i < n && c[i] != '"' {
                if c[i] == '\\' {
                    i += 1;
                }
                if i < n && c[i] == '\n' {
                    out.push('\n');
                }
                i += 1;
            }
            i += 1;
            out.push_str("\"\"");
        } else if ch == '\'' {
            if next == Some('\\') {
                // '\n', '\'', '\u{..}': skip the quote, the backslash and the escaped character
                i += 3;
                while i < n && c[i] != '\'' {
                    i += 1;
                }
                i += 1;
                out.push_str("''");
            } else if c.get(i + 2) == Some(&'\'') && next != Some('\'') {
                i += 3;
                out.push_str("''");
            } else {
                out.push('\'');
                i += 1;
            }
        } else {
            out.push(ch);
            i += 1;
        }
    }
    out
}

/// Position of the first `token` in `hay[from..]`; a token that starts with an identifier character must not
/// be preceded by one (`launch(` does not match inside `check_external_launch(`).
fn find_token(hay: &str, token: &str, from: usize) -> Option<usize> {
    let starts_ident = token.chars().next().is_some_and(is_ident);
    let mut at = from;
    while let Some(rel) = hay.get(at..)?.find(token) {
        let pos = at + rel;
        let preceded = hay[..pos].chars().next_back().is_some_and(is_ident);
        if !(starts_ident && preceded) {
            return Some(pos);
        }
        at = pos + token.len().max(1);
    }
    None
}

/// First position of any `a|b` alternative.
fn find_alt(hay: &str, token: &str) -> Option<usize> {
    token.split('|').filter_map(|t| find_token(hay, t, 0)).min()
}

fn count_token(hay: &str, token: &str) -> usize {
    let mut count = 0;
    let mut from = 0;
    while let Some(p) = find_token(hay, token, from) {
        count += 1;
        from = p + token.len().max(1);
    }
    count
}

/// Body of `fn name` (text between the outer braces), found by brace matching on cleaned code.
/// Handles `pub fn` / `pub(crate) fn` / `pub(super) fn` / `fn`, generics, `where`, lifetimes, declarations
/// without a body (skipped), and a next function that must not leak in.
fn fn_body(code: &str, name: &str) -> Option<String> {
    let needle = format!("fn {name}");
    let mut from = 0;
    while let Some(rel) = code.get(from..)?.find(&needle) {
        let pos = from + rel;
        from = pos + needle.len();
        if code[..pos].chars().next_back().is_some_and(is_ident) {
            continue;
        }
        if code[from..].chars().next().is_none_or(is_ident) {
            continue;
        }
        let rest: Vec<char> = code[from..].chars().collect();
        let (mut paren, mut bracket) = (0i32, 0i32);
        let mut k = 0;
        let mut open = None;
        while k < rest.len() {
            match rest[k] {
                '(' => paren += 1,
                ')' => paren -= 1,
                '[' => bracket += 1,
                ']' => bracket -= 1,
                ';' if paren == 0 && bracket == 0 => break,
                '{' if paren == 0 && bracket == 0 => {
                    open = Some(k);
                    break;
                }
                _ => {}
            }
            k += 1;
        }
        let Some(open) = open else { continue };
        let mut depth = 0;
        for (j, ch) in rest.iter().enumerate().skip(open) {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(rest[open + 1..j].iter().collect());
                    }
                }
                _ => {}
            }
        }
    }
    None
}

/// The parameter list of `fn name` as `(name, type)` pairs.
fn fn_params(code: &str, name: &str) -> Option<Vec<(String, String)>> {
    let needle = format!("fn {name}");
    let mut from = 0;
    while let Some(rel) = code.get(from..)?.find(&needle) {
        let pos = from + rel;
        from = pos + needle.len();
        if code[..pos].chars().next_back().is_some_and(is_ident) || code[from..].chars().next().is_none_or(is_ident) {
            continue;
        }
        let rest: Vec<char> = code[from..].chars().collect();
        let start = rest.iter().position(|c| *c == '(')?;
        let mut depth = 0;
        let mut end = None;
        for (j, ch) in rest.iter().enumerate().skip(start) {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(j);
                        break;
                    }
                }
                _ => {}
            }
        }
        let inner: Vec<char> = rest[start + 1..end?].to_vec();
        let mut parts: Vec<String> = Vec::new();
        let mut cur = String::new();
        let mut d = 0i32;
        let mut j = 0;
        while j < inner.len() {
            let ch = inner[j];
            if ch == '-' && inner.get(j + 1) == Some(&'>') {
                cur.push_str("->");
                j += 2;
                continue;
            }
            match ch {
                '<' | '(' | '[' => d += 1,
                '>' | ')' | ']' => d -= 1,
                ',' if d == 0 => {
                    parts.push(std::mem::take(&mut cur));
                    j += 1;
                    continue;
                }
                _ => {}
            }
            cur.push(ch);
            j += 1;
        }
        parts.push(cur);
        return Some(
            parts
                .into_iter()
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .filter_map(|p| p.split_once(':').map(|(n, t)| (n.trim().trim_start_matches("mut ").to_string(), t.trim().to_string())))
                .collect(),
        );
    }
    None
}

/// Drops every `#[cfg(test)]` item (a `mod x;` or a braced item) from cleaned code.
fn strip_cfg_test(code: &str) -> String {
    let mut out = String::new();
    let mut rest = code;
    while let Some(at) = rest.find("#[cfg(test)]") {
        out.push_str(&rest[..at]);
        let after = &rest[at + "#[cfg(test)]".len()..];
        // the item ends at the first `;` (mod declaration / use) or at the matching `}` of its first `{`
        let semi = after.find(';');
        let brace = after.find('{');
        let cut = match (semi, brace) {
            (Some(s), Some(b)) if s < b => s + 1,
            (Some(s), None) => s + 1,
            (_, Some(b)) => {
                let mut depth = 0;
                let mut end = after.len();
                for (i, ch) in after.char_indices().skip_while(|(i, _)| *i < b) {
                    match ch {
                        '{' => depth += 1,
                        '}' => {
                            depth -= 1;
                            if depth == 0 {
                                end = i + 1;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                end
            }
            (None, None) => after.len(),
        };
        rest = &after[cut..];
    }
    out.push_str(rest);
    out
}

fn production(rel: &str) -> String {
    strip_cfg_test(&code_only(&read_src(rel)))
}

fn all_rs_files() -> Vec<String> {
    fn walk(dir: &std::path::Path, base: &std::path::Path, out: &mut Vec<String>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, base, out);
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let mut out = Vec::new();
    walk(&src_root(), &src_root(), &mut out);
    out.sort();
    out
}

/// Production sources: no `*_tests.rs`, no test-only support / fixture files.
fn production_files() -> Vec<String> {
    const TEST_ONLY: [&str; 3] = ["test_support.rs", "zip_fixture.rs", "acl_consistency.rs"];
    all_rs_files()
        .into_iter()
        .filter(|f| {
            let name = f.rsplit('/').next().unwrap();
            !name.ends_with("_tests.rs") && !TEST_ONLY.contains(&name)
        })
        .collect()
}

/// `(command name, source file)` for every entry of `generate_handler![...]` in `lib.rs`.
fn handler_commands() -> Vec<(String, String)> {
    let lib = code_only(&read_src("lib.rs"));
    let start = lib.find("generate_handler![").expect("generate_handler! in lib.rs") + "generate_handler![".len();
    let end = start + lib[start..].find(']').expect("closing ]");
    lib[start..end]
        .split(',')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .map(|entry| {
            let segments: Vec<&str> = entry.split("::").collect();
            let (name, modules) = segments.split_last().unwrap();
            (name.to_string(), format!("{}.rs", modules.join("/")))
        })
        .collect()
}

// =============================================================================================== (a) argument table

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Class {
    Checked,
    Exempt,
}

/// R-89-1 "検査する引数" (MINOR-7). `destination` is classified per command below.
const CHECKED: [&str; 7] = ["path", "paths", "items", "destination", "parent", "base_dir", "zip_path"];
// SPEC-0200-0001 §3.16.5 / §3.16.15 MUST-141 (a): `index` (external_app_launch: the registration number) joins the exempt names (20 -> 21).
const EXEMPT: [&str; 21] = [
    "index", "new_name", "name", "kind", "output_path", "item_resolutions", "resolutions", "operation_id", "resolution",
    "effect", "expected_sequence", "probe_only", "sequence", "direction", "request_epoch", "request_seq",
    "show_hidden", "sort_key", "sort_order", "overwrite", "data",
];
/// Per-command overrides: ZIP `destination` is the user's INPUT string (R-89-5), not checked as given.
const OVERRIDES: [(&str, &str, Class); 5] = [
    ("archive_detect_conflicts", "destination", Class::Exempt),
    ("archive_extract", "destination", Class::Exempt),
    ("fs_ops_copy", "destination", Class::Checked),
    ("fs_ops_move", "destination", Class::Checked),
    ("fs_ops_detect_conflicts", "destination", Class::Checked),
];

fn classify(command: &str, arg: &str) -> Option<Class> {
    if let Some((_, _, class)) = OVERRIDES.iter().find(|(c, a, _)| *c == command && *a == arg) {
        return Some(*class);
    }
    if arg == "destination" {
        return None; // must be listed in OVERRIDES
    }
    if CHECKED.contains(&arg) {
        Some(Class::Checked)
    } else if EXEMPT.contains(&arg) {
        Some(Class::Exempt)
    } else {
        None
    }
}

fn is_injected(ty: &str) -> bool {
    ty.starts_with("AppHandle") || ty.starts_with("Window") || ty.starts_with("State<") || ty.starts_with("tauri::")
}

/// command -> its CHECKED argument names (injected Tauri types skipped). Panics on an unclassified argument.
fn checked_args_by_command() -> BTreeMap<String, Vec<String>> {
    let mut map = BTreeMap::new();
    for (command, file) in handler_commands() {
        let code = code_only(&read_src(&file));
        let params = fn_params(&code, &command).unwrap_or_else(|| panic!("{file}: `fn {command}` not found"));
        let mut checked = Vec::new();
        for (name, ty) in params {
            if is_injected(&ty) {
                continue;
            }
            match classify(&command, &name) {
                Some(Class::Checked) => checked.push(name),
                Some(Class::Exempt) => {}
                None => panic!(
                    "{file}: command `{command}` has the argument `{name}` that is in neither CHECKED nor EXEMPT \
                     (R-89-1 / AC-89): classify it (and add a row to ROWS if it is a path)"
                ),
            }
        }
        map.insert(command, checked);
    }
    map
}

#[test]
fn a_every_argument_of_every_command_is_classified_and_there_are_thirty_four_commands() {
    let commands = handler_commands();
    // SPEC-0300-0021: +external_apps_load (no argument: no row, no exemption needed) +external_app_launch (index / path / kind).
    // SPEC-0300-0022 (SPEC-0300-0011 第11版 R-89-1 "対象外"): +settings_file_check +settings_file_open (only `window` / `app`: no row, no exemption).
    assert_eq!(commands.len(), 34, "generate_handler! has 34 commands (SPEC-0300-0011 第11版 R-89-1); update the tables if it changes");
    let _ = checked_args_by_command(); // panics on an unclassified argument
}

#[test]
fn a_the_classification_tables_do_not_overlap_and_the_overrides_name_real_commands() {
    for name in EXEMPT {
        assert!(!CHECKED.contains(&name), "{name} is in both lists");
    }
    let commands: BTreeSet<String> = handler_commands().into_iter().map(|(c, _)| c).collect();
    for (command, _, _) in OVERRIDES {
        assert!(commands.contains(command), "override for an unknown command {command}");
    }
}

// =============================================================================================== (b) call-chain table

struct Row {
    command: &'static str,
    /// (file, fn): the command fn -> ... -> the last fn that holds the checks.
    chain: &'static [(&'static str, &'static str)],
    /// Tokens that must appear in the LAST fn's body, first occurrences strictly increasing. `a|b` = either.
    order: &'static [&'static str],
    /// Extra "at least N occurrences" requirements (e.g. `check_source` for both items and base_dir).
    counts: &'static [(&'static str, usize)],
}

const ABS: &str = "abs_path::first_relative|abs_path::is_absolute_path(";
const CONTAINER: &str = "e2e_scope::check_container";
const ENTRY: &str = "e2e_scope::check_entry";
const SOURCE: &str = "e2e_scope::check_source";
const LAUNCH: &str = "e2e_scope::check_external_launch";
// SPEC-0300-0021 R-1584 / SPEC-0200-0001 §3.16.15 MUST-141 (c): the registered-app launch has its OWN scope check (executable AND target),
// a different token from `LAUNCH` (the OS-association launch, always refused).
const LAUNCH_PAIR: &str = "e2e_scope::check_launch";
const RESOLVED: &str = "abs_path::is_absolute_path_buf(";
const SEPARATORS: &str = "normalize_input_separators(";

const ROWS: &[Row] = &[
    Row {
        command: "fs_list_dir",
        chain: &[("fs/commands.rs", "fs_list_dir"), ("fs/commands.rs", "list_dir_checked")],
        order: &[ABS, "query::fs_list_dir("],
        counts: &[],
    },
    Row {
        command: "fs_ops_copy",
        chain: &[("fs_ops/commands.rs", "fs_ops_copy"), ("fs_ops/guarded.rs", "copy_guarded")],
        order: &[ABS, CONTAINER, SOURCE, "copy_batch_with_resolver("],
        counts: &[],
    },
    Row {
        command: "fs_ops_move",
        chain: &[("fs_ops/commands.rs", "fs_ops_move"), ("fs_ops/guarded.rs", "move_guarded")],
        order: &[ABS, CONTAINER, ENTRY, SOURCE, "move_batch_with_resolver("],
        counts: &[],
    },
    Row {
        command: "fs_ops_detect_conflicts",
        chain: &[("fs_ops/commands.rs", "fs_ops_detect_conflicts"), ("fs_ops/guarded.rs", "detect_conflicts_guarded")],
        order: &[ABS, "detect_conflicts("],
        counts: &[],
    },
    Row {
        command: "fs_ops_delete_trash",
        chain: &[("fs_ops/commands.rs", "fs_ops_delete_trash"), ("fs_ops/guarded.rs", "delete_trash_guarded")],
        order: &[ABS, ENTRY, "delete_to_trash("],
        counts: &[],
    },
    Row {
        command: "fs_ops_delete_permanently",
        chain: &[("fs_ops/commands.rs", "fs_ops_delete_permanently"), ("fs_ops/guarded.rs", "delete_permanently_guarded")],
        order: &[ABS, ENTRY, "delete_permanently("],
        counts: &[],
    },
    Row {
        command: "fs_ops_rename",
        chain: &[("fs_ops/commands.rs", "fs_ops_rename"), ("fs_ops/guarded.rs", "rename_guarded")],
        order: &[ABS, ENTRY, CONTAINER, "rename_entry("],
        counts: &[],
    },
    Row {
        command: "fs_ops_create",
        chain: &[("fs_ops/commands.rs", "fs_ops_create"), ("fs_ops/guarded.rs", "create_guarded")],
        order: &[ABS, CONTAINER, "create_entry("],
        counts: &[],
    },
    Row {
        command: "archive_check_create",
        chain: &[("archive/commands.rs", "archive_check_create"), ("archive/guarded.rs", "check_create_guarded")],
        order: &[ABS, SEPARATORS, "resolve_output_path(", RESOLVED, "check_create("],
        counts: &[],
    },
    Row {
        command: "archive_create",
        chain: &[("archive/commands.rs", "archive_create"), ("archive/guarded.rs", "create_guarded")],
        order: &[ABS, SEPARATORS, "resolve_output_path(", RESOLVED, CONTAINER, SOURCE, "create_zip("],
        counts: &[(SOURCE, 2)], // items AND base_dir (R-10-6; currently archive/commands.rs:194)
    },
    Row {
        command: "archive_detect_conflicts",
        chain: &[("archive/commands.rs", "archive_detect_conflicts"), ("archive/guarded.rs", "detect_conflicts_guarded")],
        order: &[ABS, SEPARATORS, "join_destination(", RESOLVED, "build_plan("],
        counts: &[],
    },
    Row {
        command: "archive_extract",
        chain: &[("archive/commands.rs", "archive_extract"), ("archive/guarded.rs", "extract_guarded")],
        order: &[ABS, SEPARATORS, "join_destination(", RESOLVED, CONTAINER, SOURCE, "extract("],
        counts: &[],
    },
    Row {
        command: "viewer_classify_path",
        chain: &[("viewer/commands.rs", "viewer_classify_path"), ("viewer/guarded.rs", "classify_guarded")],
        order: &[ABS, "classify_path("],
        counts: &[],
    },
    Row {
        command: "viewer_open",
        chain: &[("viewer/commands.rs", "viewer_open"), ("viewer/guarded.rs", "open_viewer_guarded")],
        order: &["is_newer(", ABS, "build_session(", "classify_path("],
        counts: &[],
    },
    Row {
        command: "viewer_os_open_path",
        chain: &[("viewer/commands.rs", "viewer_os_open_path"), ("viewer/guarded.rs", "os_open_guarded")],
        order: &[ABS, LAUNCH, "resolve_target(", "launch("],
        counts: &[],
    },
    // SPEC-0300-0021 R-1582 / AC-1524: ABS first, then the executable is resolved (read-only PATH lookup), THEN one scope check for
    // (executable, target), then the target must still exist, then the process is created. Q-4: the resolution is a read; nothing
    // is created or changed before both are judged.
    Row {
        command: "external_app_launch",
        chain: &[("external_apps/commands.rs", "external_app_launch"), ("external_apps/guarded.rs", "launch_guarded")],
        order: &[ABS, "resolve(", LAUNCH_PAIR, "verify(", "spawn("],
        counts: &[(LAUNCH_PAIR, 1)],
    },
    Row {
        command: "viewer_read_text",
        chain: &[("viewer/commands.rs", "viewer_read_text"), ("viewer/guarded.rs", "read_text_guarded")],
        order: &[ABS, "canonicalize", "is_allowed(", "read_text("],
        counts: &[],
    },
    Row {
        command: "viewer_read_image",
        chain: &[("viewer/commands.rs", "viewer_read_image"), ("viewer/guarded.rs", "read_image_guarded")],
        order: &[ABS, "canonicalize", "is_allowed(", "read_image("],
        counts: &[],
    },
    Row {
        command: "clipboard_set_files",
        chain: &[
            ("fs_ops/clipboard/commands.rs", "clipboard_set_files"),
            ("fs_ops/clipboard/commands.rs", "set_files_with"),
            ("fs_ops/clipboard/flow.rs", "write_files"),
        ],
        order: &[ABS, "build_hdrop("],
        counts: &[],
    },
];

/// The file-system accesses before which the absolute-path check must already have happened (3.12.8 (b) iv).
const FS_TOKENS: [&str; 8] = ["std::fs", "fs::", ".exists(", "canonicalize", "File::", "read_dir", "metadata", "e2e_scope::check_"];

fn body_of(file: &str, name: &str) -> String {
    fn_body(&production(file), name).unwrap_or_else(|| panic!("src/{file}: `fn {name}` not found (inner layer missing?)"))
}

#[test]
fn b_every_command_with_a_checked_argument_has_exactly_one_row_and_no_row_is_stale() {
    let by_command = checked_args_by_command();
    let needing: BTreeSet<&str> = by_command.iter().filter(|(_, args)| !args.is_empty()).map(|(c, _)| c.as_str()).collect();
    let rows: Vec<&str> = ROWS.iter().map(|r| r.command).collect();
    let row_set: BTreeSet<&str> = rows.iter().copied().collect();
    assert_eq!(rows.len(), row_set.len(), "a command has two rows");
    let missing: Vec<_> = needing.difference(&row_set).collect();
    let stale: Vec<_> = row_set.difference(&needing).collect();
    assert!(missing.is_empty(), "commands with a path argument but no row (a new command?): {missing:?}");
    assert!(stale.is_empty(), "rows for commands that are gone or have no checked argument: {stale:?}");
    for row in ROWS {
        let (file, name) = row.chain[0];
        assert_eq!(name, row.command, "the chain starts with the command fn");
        let declared = handler_commands().into_iter().find(|(c, _)| c == row.command).unwrap().1;
        assert_eq!(file, declared, "{}: the chain's first file is where generate_handler! finds it", row.command);
    }
}

#[test]
fn b_each_chain_function_calls_the_next_and_the_command_fn_checks_nothing_itself() {
    for row in ROWS {
        for pair in row.chain.windows(2) {
            let body = body_of(pair[0].0, pair[0].1);
            let next = format!("{}(", pair[1].1);
            assert!(
                find_token(&body, &next, 0).is_some(),
                "{}: `{}` in src/{} must call `{}`",
                row.command, pair[0].1, pair[0].0, pair[1].1
            );
        }
        // R-89-6-1: the command fn does not check (abs_path / e2e_scope are inner-layer business)
        let first = body_of(row.chain[0].0, row.chain[0].1);
        assert!(!first.contains("e2e_scope::"), "{}: the command fn must not call e2e_scope (R-89-6-1)", row.command);
        assert!(!first.contains("abs_path::"), "{}: the command fn must not call abs_path (R-89-6-1)", row.command);
    }
}

#[test]
fn b_the_inner_layer_takes_no_tauri_injected_types() {
    for row in ROWS {
        for (file, name) in &row.chain[1..] {
            let params = fn_params(&production(file), name).unwrap_or_else(|| panic!("src/{file}: `fn {name}` not found"));
            for (arg, ty) in params {
                assert!(!is_injected(&ty), "{}: inner `{name}` takes the Tauri type `{arg}: {ty}` (R-89-6-1)", row.command);
            }
        }
    }
}

#[test]
fn b_the_last_function_runs_its_checks_in_the_specified_order() {
    for row in ROWS {
        let (file, name) = row.chain[row.chain.len() - 1];
        let body = body_of(file, name);
        let mut previous: Option<(usize, &str)> = None;
        for token in row.order {
            let at = find_alt(&body, token)
                .unwrap_or_else(|| panic!("{}: `{name}` in src/{file} lacks the token `{token}` (order {:?})", row.command, row.order));
            if let Some((prev_at, prev_token)) = previous {
                assert!(
                    at > prev_at,
                    "{}: in `{name}` the token `{token}` must come after `{prev_token}` (order {:?})",
                    row.command, row.order
                );
            }
            previous = Some((at, token));
        }
        for (token, min) in row.counts {
            assert!(count_token(&body, token) >= *min, "{}: `{name}` needs `{token}` at least {min} times", row.command);
        }
    }
}

#[test]
fn b_the_absolute_path_check_is_before_the_first_file_system_access() {
    for row in ROWS {
        let (file, name) = row.chain[row.chain.len() - 1];
        let body = body_of(file, name);
        let abs = body.find("abs_path::").unwrap_or_else(|| panic!("{}: `{name}` never calls abs_path::", row.command));
        for fs_token in FS_TOKENS {
            if let Some(at) = find_token(&body, fs_token, 0) {
                assert!(abs < at, "{}: in `{name}` `abs_path::` must come before the file-system access `{fs_token}`", row.command);
            }
        }
    }
}

// =============================================================================================== (c) one judgement

#[test]
fn c_the_absolute_path_judgement_exists_in_one_place() {
    let defining = ["fn is_drive_prefix", "fn is_volume_guid", "fn is_adoptable", "const MAX_PATH_UTF16"];
    for file in production_files() {
        if file == "shared/abs_path.rs" {
            continue;
        }
        let code = production(&file);
        for token in defining {
            assert!(find_token(&code, token, 0).is_none(), "src/{file} defines `{token}`: the judgement lives only in shared/abs_path.rs (R-89-6)");
        }
        assert!(find_token(&code, "is_adoptable", 0).is_none(), "src/{file} still names is_adoptable (no re-export either)");
    }
    let abs = production("shared/abs_path.rs");
    assert!(find_token(&abs, "fn is_absolute_path", 0).is_some(), "shared/abs_path.rs defines is_absolute_path");
    assert!(production("fs_ops/clipboard/paths.rs").contains("abs_path::"), "paths.rs (adopt_paths) must call abs_path::");
}

// =============================================================================================== (d) Path::is_absolute allow-list

/// MUST-125: every production file that calls `.is_absolute()`, with the reason. `shared/identity.rs` and
/// `config/paths.rs` keep their own judgement (their behaviour must not change).
const IS_ABSOLUTE_ALLOWED: [(&str, &str); 6] = [
    ("archive/create.rs", "resolve_output_path: whether to join the input to base_dir (Rust's meaning)"),
    ("archive/extract_plan.rs", "resolve_destination / join_destination: same"),
    ("archive/win_fs.rs", "long-path prefix: Win32 formatting, not a judgement"),
    ("shared/e2e_scope.rs", "usable / resolve_scope: lexical rules of the E2E scope"),
    ("shared/identity.rs", "normalize_allowing_missing: identity normalisation (behaviour must not change)"),
    ("config/paths.rs", "override folder check at start-up (SPEC-0400-0001 R-06-2)"),
];

#[test]
fn d_is_absolute_is_called_only_in_the_allowed_files() {
    let allowed: Vec<&str> = IS_ABSOLUTE_ALLOWED.iter().map(|(f, _)| *f).collect();
    for file in production_files() {
        let code = production(&file);
        let uses = code.contains(".is_absolute()");
        if uses {
            assert!(
                allowed.contains(&file.as_str()),
                "src/{file} calls `.is_absolute()`: use shared::abs_path, or add the file to IS_ABSOLUTE_ALLOWED with a reason (3.12.8 (d))"
            );
        }
    }
}

#[test]
fn d_the_allow_list_has_no_stale_entries() {
    for (file, reason) in IS_ABSOLUTE_ALLOWED {
        assert!(production(file).contains(".is_absolute()"), "src/{file} no longer calls .is_absolute(); remove it from the list ({reason})");
    }
}

// =============================================================================================== (e) scope tokens per command (MUST-126)

const REQUIRED_SCOPE_TOKENS: [(&str, &[&str]); 10] = [
    ("fs_ops_copy", &[CONTAINER, SOURCE]),
    ("fs_ops_move", &[CONTAINER, ENTRY, SOURCE]),
    ("fs_ops_delete_trash", &[ENTRY]),
    ("fs_ops_delete_permanently", &[ENTRY]),
    ("fs_ops_rename", &[ENTRY, CONTAINER]),
    ("fs_ops_create", &[CONTAINER]),
    ("archive_create", &[CONTAINER, SOURCE]),
    ("archive_extract", &[CONTAINER, SOURCE]),
    ("viewer_os_open_path", &[LAUNCH]),
    ("external_app_launch", &[LAUNCH_PAIR]),
];

fn row(command: &str) -> &'static Row {
    ROWS.iter().find(|r| r.command == command).unwrap_or_else(|| panic!("no row for {command}"))
}

// (m1): the rows whose order has an `e2e_scope::check_` token are EXACTLY the nine commands (by name).
#[test]
fn e_m1_exactly_the_ten_specified_commands_have_scope_checks() {
    let with_scope: BTreeSet<&str> = ROWS.iter().filter(|r| r.order.iter().any(|t| t.contains("e2e_scope::check_"))).map(|r| r.command).collect();
    let expected: BTreeSet<&str> = REQUIRED_SCOPE_TOKENS.iter().map(|(c, _)| *c).collect();
    assert_eq!(with_scope, expected, "the E2E-scope rows must be the ten commands of SPEC-0400-0001 R-10 (第6版: + external_app_launch)");
    assert_eq!(expected.len(), 10);
}

// Each of the nine keeps the individual token(s) the three old boundary tests used to fix (container-only or
// entry-for-source substitutions fail here).
#[test]
fn e_each_of_the_ten_rows_contains_its_required_scope_tokens() {
    for (command, tokens) in REQUIRED_SCOPE_TOKENS {
        let order = row(command).order;
        for token in tokens {
            assert!(order.contains(token), "{command}: the order must include `{token}` (MUST-126)");
        }
    }
    assert!(row("archive_create").counts.contains(&(SOURCE, 2)), "archive_create: check_source for items AND base_dir (R-10-6)");
}

// (m2): SHOULD-179 and R-10-6 survive the move of the checks into the inner layer.
#[test]
fn e_m2_should179_and_r10_6_tokens_are_in_the_right_rows() {
    assert!(row("viewer_os_open_path").order.contains(&LAUNCH), "SHOULD-179: check_external_launch, never check_source / check_container");
    for command in ["fs_ops_copy", "fs_ops_move", "archive_create", "archive_extract"] {
        assert!(row(command).order.contains(&SOURCE), "R-10-6: {command} checks its read source with check_source");
    }
    let os_open = body_of("viewer/guarded.rs", "os_open_guarded");
    assert!(!os_open.contains("e2e_scope::check_source") && !os_open.contains("e2e_scope::check_container"), "os_open uses only the launch check");
}

// (m3) SPEC-0200-0001 §3.16.15 MUST-141 (d): the two launch checks are never mixed up. The OS-association launch stays "always refused"
// (SPEC-0400-0001 R-10-5); the registered-app launch uses the pair check, exactly ONCE, and never `check_external_launch`.
#[test]
fn e_m3_the_registered_app_launch_uses_check_launch_once_and_never_check_external_launch() {
    assert!(row("external_app_launch").order.contains(&LAUNCH_PAIR));
    assert!(!row("external_app_launch").order.contains(&LAUNCH), "external_app_launch must not use check_external_launch (that one always refuses)");
    assert!(!row("viewer_os_open_path").order.contains(&LAUNCH_PAIR), "viewer_os_open_path stays on check_external_launch only");
    let inner = body_of("external_apps/guarded.rs", "launch_guarded");
    assert_eq!(count_token(&inner, LAUNCH_PAIR), 1, "ONE check_launch(exe, target) call, after the resolution (MUST-141 (c))");
    assert!(!inner.contains("check_external_launch") && !inner.contains("e2e_scope::check_source") && !inner.contains("e2e_scope::check_container"));
    let os_open = body_of("viewer/guarded.rs", "os_open_guarded");
    assert!(os_open.contains(LAUNCH) && !os_open.contains(LAUNCH_PAIR), "os_open_guarded is unchanged");
}

// =============================================================================================== (f) how the check is written, SHOULD-187

#[test]
fn f_inner_layers_import_the_module_not_the_functions() {
    let files: BTreeSet<&str> = ROWS.iter().flat_map(|r| r.chain.iter().map(|(f, _)| *f)).collect();
    for file in files {
        let code = production(file);
        for statement in code.split("use ").skip(1) {
            let statement = statement.split(';').next().unwrap_or("");
            if statement.contains("abs_path") {
                assert!(
                    statement.trim().ends_with("abs_path"),
                    "src/{file}: `use {}` -- import the module (`use crate::shared::abs_path;`) so the calls read `abs_path::first_relative` (MINOR-10)",
                    statement.trim()
                );
            }
        }
    }
}

#[test]
fn f_commands_depend_on_guarded_one_way_only() {
    for (commands, guarded) in [
        ("fs_ops/commands.rs", "fs_ops/guarded.rs"),
        ("archive/commands.rs", "archive/guarded.rs"),
        ("viewer/commands.rs", "viewer/guarded.rs"),
        ("external_apps/commands.rs", "external_apps/guarded.rs"),
    ] {
        assert!(production(commands).contains("guarded"), "src/{commands} must call the inner layer in {guarded}");
        let inner = production(guarded);
        assert!(
            !inner.contains("super::commands") && !inner.contains("commands::"),
            "src/{guarded} must not refer to commands.rs (SHOULD-187: commands -> guarded only)"
        );
    }
}

#[test]
fn f_the_viewer_command_file_no_longer_holds_the_helpers() {
    let commands = production("viewer/commands.rs");
    for helper in ["fn read_sample", "fn classify_path", "fn kind_to_wire", "fn resolve_target", "fn resolve_base_dir", "fn build_session"] {
        assert!(find_token(&commands, helper, 0).is_none(), "SHOULD-187: `{helper}` moves to viewer/guarded.rs");
    }
    let archive_commands = production("archive/commands.rs");
    for helper in ["fn to_paths", "fn display", "fn scope_error"] {
        assert!(find_token(&archive_commands, helper, 0).is_none(), "SHOULD-187: `{helper}` moves to archive/guarded.rs");
    }
}

// =============================================================================================== the helpers themselves

fn body(src: &str, name: &str) -> Option<String> {
    fn_body(&code_only(src), name)
}

fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn helper_fn_body_stops_at_the_matching_brace_not_at_the_next_function() {
    let src = "fn a() { let x = { 1 }; if x > 0 { f(); } }\nfn b() { g(); }";
    assert_eq!(squash(&body(src, "a").unwrap()), "let x = { 1 }; if x > 0 { f(); }");
    assert_eq!(squash(&body(src, "b").unwrap()), "g();");
}

#[test]
fn helper_fn_body_handles_all_visibility_forms() {
    for vis in ["", "pub ", "pub(crate) ", "pub(super) ", "pub(in crate::x) "] {
        let src = format!("{vis}fn target(x: u8) -> u8 {{ x + 1 }}");
        assert_eq!(squash(&body(&src, "target").unwrap()), "x + 1", "{vis:?}");
    }
}

#[test]
fn helper_fn_body_handles_generics_where_clauses_and_lifetimes() {
    let src = "pub fn t<'a, T: Fn(&str) -> Result<(), String>>(f: T, s: &'a str) -> &'a str where T: Copy, { f(s).ok(); s }";
    assert_eq!(squash(&body(src, "t").unwrap()), "f(s).ok(); s");
    let src2 = "fn run(items: &[String], hook: impl FnMut(Event) -> bool) -> Result<Vec<u8>, E> { go(items) }";
    assert_eq!(squash(&body(src2, "run").unwrap()), "go(items)");
}

#[test]
fn helper_fn_body_ignores_braces_in_strings_chars_comments_and_raw_strings() {
    let src = r##"fn t() {
        let a = format!("{x} }} {{");
        let b = '{';
        let c = '}';
        let d = '\'';
        // } a comment brace
        /* } { block */
        let e = r#"} raw { "#;
        done();
    }
    fn after() { other(); }"##;
    let b = body(src, "t").unwrap();
    assert!(b.contains("done();"), "{b}");
    assert!(!b.contains("other()"), "{b}");
    assert_eq!(squash(&body(src, "after").unwrap()), "other();");
}

#[test]
fn helper_fn_body_skips_a_declaration_without_a_body_and_does_not_match_longer_names() {
    let src = "trait T { fn target(&self); }\nfn target_more() { wrong(); }\nfn my_target() { wrong2(); }\nfn target() { right(); }";
    assert_eq!(squash(&body(src, "target").unwrap()), "right();");
    assert!(body("fn only_other() { x(); }", "target").is_none());
}

#[test]
fn helper_code_only_keeps_lifetimes_and_removes_comments() {
    let c = code_only("fn f<'a>(x: &'a str) -> &'a str { x } // trailing { comment\n/* { */ let y = 1;");
    assert!(c.contains("<'a>") && c.contains("&'a str"), "{c}");
    assert!(!c.contains("comment") && !c.contains("/*"), "{c}");
    assert!(c.contains("let y = 1;"));
}

#[test]
fn helper_find_token_respects_identifier_boundaries() {
    let hay = "e2e_scope::check_external_launch(p)?; launch(&r)";
    assert_eq!(find_token(hay, "launch(", 0), hay.find(" launch(").map(|p| p + 1));
    assert!(find_token("check_create_guarded(x)", "create_guarded(", 0).is_none());
    assert!(find_token("a::create_guarded(x)", "create_guarded(", 0).is_some());
    assert_eq!(find_alt("x abs_path::is_absolute_path(p) abs_path::first_relative(q)", "abs_path::first_relative|abs_path::is_absolute_path("), Some(2));
    assert_eq!(count_token("a::check_source(x); b::check_source(y)", "e2e_scope::check_source"), 0);
    assert_eq!(count_token("e2e_scope::check_source(x); e2e_scope::check_source(y)", "e2e_scope::check_source"), 2);
}

#[test]
fn helper_fn_params_splits_at_top_level_commas_only() {
    let code = code_only("pub fn f(app: AppHandle, m: State<CancelRegistry>, items: Vec<String>, r: Option<HashMap<String, String>>, c: impl Fn(&Path) -> X) -> Y {}");
    let params = fn_params(&code, "f").unwrap();
    let names: Vec<&str> = params.iter().map(|(n, _)| n.as_str()).collect();
    assert_eq!(names, ["app", "m", "items", "r", "c"]);
    assert!(is_injected(&params[0].1) && is_injected(&params[1].1) && !is_injected(&params[2].1));
}

#[test]
fn helper_strip_cfg_test_removes_test_modules_and_declarations() {
    let code = code_only("fn keep() {}\n#[cfg(test)]\nmod tests { fn gone() { .is_absolute() } }\n#[cfg(test)]\nmod more_tests;\nfn also_keep() {}");
    let stripped = strip_cfg_test(&code);
    assert!(stripped.contains("fn keep") && stripped.contains("fn also_keep"));
    assert!(!stripped.contains("gone") && !stripped.contains("more_tests"), "{stripped}");
}
