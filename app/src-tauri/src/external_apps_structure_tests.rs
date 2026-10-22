//! TDD (unit-test-writer, 2026-10-17): crate-wide STRUCTURE tests of the external-app launch (SPEC-0300-0021). Like
//! `abs_path_structure_tests.rs` / `acl_consistency.rs` this reads the SOURCE of `src/` (text scans; honest limit: helper internals
//! are not followed), so it compiles and RUNS today and is RED until `external_apps/` exists. The behaviour tests live next to the
//! modules (`external_apps/*_tests.rs`, which the implementer wires into `external_apps/mod.rs` -- the first test below checks that
//! they ARE wired, so a forgotten `mod xxx_tests;` cannot make them silently disappear).
//!
//! Specs / design pinned here:
//! * SPEC-0300-0021 R-1544 + AC-1520-1 (the process creation gets only a `ResolvedExe`; ONE `Command::new`), R-1546 / R-1547 / R-1548
//!   (stdin / stdout / stderr all `Stdio::null()`, no waiting, no `creation_flags`, no elevation, no console special-casing), AC-1534
//!   (no branch on a default's name / program; defaults are DATA in `defaults.rs` with no Japanese; the explorer's `args_for_file`
//!   is the two elements `"/select,"`, `"{path}"` and there is no `raw_arg`), R-1510-1 (the `default` mark changes only where the
//!   `name` comes from), R-1581 / AC-1524 / AC-1526 (the command takes only `index` / `path` / `kind`; no `tauri-plugin-shell`, no
//!   execute permission), R-1540 3 (`abs_path::is_absolute_path_buf`, never `Path::is_absolute`), R-1555 (main window only);
//! * SPEC-0200-0001 §3.16.2 (module layout, `config/` never imports `external_apps/`, `Registry` immutable), §3.16.0 (no new external
//!   dependency, no `unsafe`, no `[[bin]]`; the probe is a Cargo example), §3.16.15 MUST-142 (the environment is read in ONE place,
//!   `lib.rs`, and injected), SHOULD-212 (the single production `Command::new` / `std::process::Command` site, aliases and full paths
//!   included; the OS-association launch stays in `viewer/`), SHOULD-215 (c) (`resolve` never reads the current folder), MINOR-32
//!   (`examples/` is scanned for `unsafe` and must forbid it).

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

// =============================================================================================== helpers

pub(crate) fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub(crate) fn src(rel: &str) -> PathBuf {
    manifest_dir().join("src").join(rel)
}

pub(crate) fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

pub(crate) fn rel(path: &Path) -> String {
    path.strip_prefix(manifest_dir()).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

pub(crate) fn is_ident(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Comments removed. `keep_strings == false` also blanks the CONTENT of string / char literals (`""` / `''` stay) so braces,
/// paths and words inside them cannot confuse a scan; `true` keeps them (for the checks that read literal values).
fn scrub(src: &str, keep_strings: bool) -> String {
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
            let mut j = i + 1;
            let mut hashes = 0;
            while j < n && c[j] == '#' {
                hashes += 1;
                j += 1;
            }
            if j < n && c[j] == '"' {
                j += 1;
                let start = j;
                loop {
                    if j >= n {
                        break;
                    }
                    if c[j] == '"' && (0..hashes).all(|k| c.get(j + 1 + k) == Some(&'#')) {
                        break;
                    }
                    j += 1;
                }
                out.push('"');
                if keep_strings {
                    out.extend(&c[start..j.min(n)]);
                } else {
                    out.extend(c[start..j.min(n)].iter().filter(|x| **x == '\n'));
                }
                out.push('"');
                i = (j + 1 + hashes).min(n);
            } else {
                out.push(ch);
                i += 1;
            }
        } else if ch == '"' {
            i += 1;
            out.push('"');
            while i < n && c[i] != '"' {
                if c[i] == '\\' {
                    if keep_strings {
                        out.push(c[i]);
                    }
                    i += 1;
                    if i >= n {
                        break;
                    }
                }
                if keep_strings || c[i] == '\n' {
                    out.push(c[i]);
                }
                i += 1;
            }
            i += 1;
            out.push('"');
        } else if ch == '\'' {
            if next == Some('\\') {
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

pub(crate) fn code_only(text: &str) -> String {
    scrub(text, false)
}

pub(crate) fn code_with_strings(text: &str) -> String {
    scrub(text, true)
}

/// Drops every `#[cfg(test)]` item (a `mod x;` or a braced item).
pub(crate) fn strip_cfg_test(code: &str) -> String {
    let mut out = String::new();
    let mut rest = code;
    while let Some(at) = rest.find("#[cfg(test)]") {
        out.push_str(&rest[..at]);
        let after = &rest[at + "#[cfg(test)]".len()..];
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

pub(crate) fn rust_files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            rust_files_under(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

pub(crate) fn files_under(sub: &str) -> Vec<PathBuf> {
    let mut v = Vec::new();
    rust_files_under(&src(sub), &mut v);
    v.sort();
    v
}

pub(crate) fn is_test_file(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.ends_with("_tests.rs") || name == "test_support.rs" || name == "zip_fixture.rs" || name == "acl_consistency.rs"
}

/// Production sources of `external_apps/` (no `*_tests.rs`), `#[cfg(test)]` items removed, comments removed, string CONTENT kept.
fn ext_production() -> Vec<(String, String)> {
    let files = files_under("external_apps");
    assert!(!files.is_empty(), "src/external_apps/ does not exist yet (RED until the module is implemented)");
    let production: Vec<(String, String)> = files
        .into_iter()
        .filter(|p| !is_test_file(p))
        .map(|p| {
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            (name, strip_cfg_test(&code_with_strings(&read(&p))))
        })
        .collect();
    // the behaviour tests already sit in this folder: an empty production list must not make the scans pass vacuously
    assert!(production.iter().any(|(n, _)| n == "mod.rs"), "src/external_apps/mod.rs does not exist yet (RED until the module is implemented)");
    production
}

fn ext_file(name: &str) -> String {
    let path = src(&format!("external_apps/{name}"));
    assert!(path.is_file(), "src/external_apps/{name} must exist");
    strip_cfg_test(&code_with_strings(&read(&path)))
}

pub(crate) fn crate_uses(code: &str) -> Vec<String> {
    let mut used = Vec::new();
    for (i, _) in code.match_indices("crate::") {
        let rest = &code[i + "crate::".len()..];
        if let Some(group) = rest.strip_prefix('{') {
            let end = group.find('}').unwrap_or(group.len());
            for part in group[..end].split(',') {
                let name: String = part.trim().chars().take_while(|c| is_ident(*c)).collect();
                if !name.is_empty() {
                    used.push(name);
                }
            }
        } else {
            used.push(rest.chars().take_while(|c| is_ident(*c)).collect());
        }
    }
    used
}

/// Text from the `(` after `needle` to its matching `)` (exclusive).
pub(crate) fn call_args(code: &str, needle: &str) -> Option<String> {
    let at = code.find(needle)? + needle.len();
    let rest = &code[at..];
    let mut depth = 1;
    for (i, ch) in rest.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(rest[..i].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

/// `(name, type)` of the parameters of `fn name(...)`.
pub(crate) fn fn_params(code: &str, name: &str) -> Option<Vec<(String, String)>> {
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
        let mut parts = Vec::new();
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

pub(crate) fn is_injected(ty: &str) -> bool {
    ty.starts_with("AppHandle")
        || ty.starts_with("Window")
        || ty.starts_with("WebviewWindow")
        || ty.starts_with("State<")
        || ty.starts_with("tauri::")
}

pub(crate) fn has_cjk(text: &str) -> bool {
    text.chars().any(|c| ('\u{3000}'..='\u{30FF}').contains(&c) || ('\u{3400}'..='\u{9FFF}').contains(&c) || ('\u{FF00}'..='\u{FFEF}').contains(&c))
}

// =============================================================================================== wiring of the new tests

#[test]
fn the_new_modules_and_every_test_module_are_wired() {
    let mod_rs = code_with_strings(&read(&src("external_apps/mod.rs")));
    for module in ["defaults", "registry", "template", "program", "exists", "target", "launch", "guarded", "error", "commands", "open_file"] {
        assert!(mod_rs.contains(&format!("mod {module};")), "external_apps/mod.rs must declare `mod {module};`");
        assert!(src(&format!("external_apps/{module}.rs")).is_file(), "src/external_apps/{module}.rs must exist");
    }
    for test in [
        "template_tests", "program_tests", "exists_tests", "registry_tests", "target_tests", "launch_tests", "guarded_tests",
        "commands_tests", "error_tests", "open_file_tests", "registry_lines_tests", "commands_lines_tests",
    ] {
        let at = mod_rs.find(&format!("mod {test};")).unwrap_or_else(|| panic!("external_apps/mod.rs must declare `mod {test};` (the tests are written, only the wiring is missing)"));
        assert!(mod_rs[..at].trim_end().ends_with("#[cfg(test)]"), "`mod {test};` must be behind #[cfg(test)]");
        assert!(src(&format!("external_apps/{test}.rs")).is_file(), "{test}.rs must exist");
    }
    let shared = code_with_strings(&read(&src("shared/mod.rs")));
    assert!(shared.contains("mod e2e_scope_launch_tests;"), "shared/mod.rs must declare #[cfg(test)] `mod e2e_scope_launch_tests;`");
    let config = code_with_strings(&read(&src("config/mod.rs")));
    assert!(config.contains("mod config_toml_external_apps_tests;"), "config/mod.rs must declare #[cfg(test)] `mod config_toml_external_apps_tests;`");
    let schema = code_with_strings(&read(&src("shared/schema/mod.rs")));
    assert!(schema.contains("pub mod external_apps;"), "shared/schema/mod.rs must declare `pub mod external_apps;`");
    assert!(src("shared/schema/external_apps.rs").is_file());
    let lib = code_with_strings(&read(&src("lib.rs")));
    assert!(lib.contains("pub mod external_apps;"), "lib.rs must declare `pub mod external_apps;`");
}

// =============================================================================================== dependency direction (§3.16.2, MUST-142 (b))

#[test]
fn external_apps_depends_on_shared_and_itself_only() {
    let mut offenders = Vec::new();
    for (name, code) in ext_production() {
        for used in crate_uses(&code_only(&code)) {
            if used != "shared" && used != "external_apps" {
                offenders.push(format!("external_apps/{name}: crate::{used}"));
            }
        }
        if code_only(&code).contains(&["super", "::", "super", "::"].concat()) {
            offenders.push(format!("external_apps/{name}: parent-of-parent module path"));
        }
    }
    assert!(offenders.is_empty(), "external_apps/ may use shared/ only (config/, fs/, fs_ops/, archive/, viewer/ are forbidden):\n  {}", offenders.join("\n  "));
}

#[test]
fn no_other_module_uses_external_apps() {
    let mut offenders = Vec::new();
    for dir in ["config", "fs", "fs_ops", "archive", "viewer", "shared", "settings_file"] {
        for path in files_under(dir) {
            let code = code_only(&read(&path));
            if crate_uses(&code).iter().any(|u| u == "external_apps") || code.contains("super::external_apps") {
                offenders.push(rel(&path));
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "only lib.rs (the bootstrap) joins config/ and external_apps/ (config/ hands over the RAW value via shared/schema): {offenders:?}"
    );
}

#[test]
fn only_commands_rs_names_tauri() {
    let mut offenders = Vec::new();
    for (name, code) in ext_production() {
        let c = code_only(&code);
        if name != "commands.rs" && (c.contains("tauri::") || c.contains("use tauri")) {
            offenders.push(name.clone());
        }
        assert!(!c.contains("tauri_plugin"), "external_apps/{name} must not use a tauri plugin (R-1581)");
    }
    assert!(offenders.is_empty(), "the inner layers take no Tauri types (R-89-6-1): {offenders:?}");
}

#[test]
fn no_unsafe_and_no_windows_binding_in_external_apps() {
    let word = ["uns", "afe"].concat();
    let sys = ["windows", "_sys"].concat();
    for (name, code) in ext_production() {
        let c = code_only(&code);
        for (i, _) in c.match_indices(word.as_str()) {
            let before = c[..i].chars().next_back();
            let after = c[i + word.len()..].chars().next();
            assert!(before.is_some_and(is_ident) || after.is_some_and(is_ident), "external_apps/{name} contains `{word}` (§3.16.0: none at all)");
        }
        assert!(!c.contains(sys.as_str()), "external_apps/{name} must not use the Win32 binding (std::os::windows::fs::MetadataExt is enough, spike S-1)");
    }
}

// =============================================================================================== the environment (MUST-142 (a))

#[test]
fn external_apps_never_reads_the_environment_or_the_current_folder_itself() {
    for (name, code) in ext_production() {
        let c = code_only(&code);
        for forbidden in ["env::var", "env::vars", "env::current_dir", "env::current_exe", "set_current_dir"] {
            assert!(!c.contains(forbidden), "external_apps/{name} uses `{forbidden}`: the environment arrives by injection from lib.rs (MUST-142), and `resolve` never looks at the current folder (SHOULD-215 (c))");
        }
    }
}

// SPEC-0200-0001 §3.17.15 (rewrites §3.16.15 MUST-142 (a)): the environment is read by `config_bridge/env.rs` (not `lib.rs`), and
// `Registry::from_raw(` is called in ONE place, `config_bridge/evaluate.rs`, which injects the raw value, its lines, the lookup and
// the PATH snapshot. `lib.rs` reads no environment at all and goes through `config_bridge::snapshot(`.
#[test]
fn config_bridge_env_rs_is_the_one_reader_and_evaluate_rs_injects_it_into_the_registry() {
    let lib = code_with_strings(&read(&src("lib.rs")));
    assert!(!lib.contains("env::var"), "lib.rs must not read the environment any more (§3.17.15): it is config_bridge/env.rs's job");
    assert!(!lib.contains("Registry::from_raw("), "lib.rs must not build the registry itself: it calls config_bridge::snapshot(");
    assert!(lib.contains("config_bridge::snapshot("), "lib.rs must call config_bridge::snapshot(..)");

    let env_rs = strip_cfg_test(&code_with_strings(&read(&src("config_bridge/env.rs"))));
    assert!(env_rs.contains("var_os("), "config_bridge/env.rs reads the environment");
    for name in ["pub fn lookup(", "pub fn path_var(", "pub fn local_app_data("] {
        assert!(env_rs.contains(name), "config_bridge/env.rs must define `{name}..`");
    }

    let mut calls = Vec::new();
    for path in files_under("") {
        if is_test_file(&path) {
            continue;
        }
        let code = strip_cfg_test(&code_with_strings(&read(&path)));
        let n = code.matches("Registry::from_raw(").count();
        if n > 0 {
            calls.push((rel(&path), n));
        }
    }
    assert_eq!(calls, vec![("src/config_bridge/evaluate.rs".to_string(), 1)], "Registry::from_raw( has ONE production call site: {calls:?}");

    let evaluate = strip_cfg_test(&code_with_strings(&read(&src("config_bridge/evaluate.rs"))));
    let args = call_args(&evaluate, "Registry::from_raw(").expect("Registry::from_raw(..)");
    assert!(args.contains("external_apps"), "the raw value (and its lines) come from the loaded config: {args}");
    assert!(args.contains("lines"), "R-1642: the lines of the external apps are handed in: {args}");
    // The one call is the shared `registry_of(startup, env, path_var)`, which both `snapshot(app)` (with `&env::lookup` and
    // `env::path_var()`) and the AppHandle-free seam `snapshot_at(path, env, path_var)` feed: the call's arguments are the injected
    // parameters, and the real environment enters in `snapshot` only.
    assert!(evaluate.contains("&env::lookup"), "the %NAME% lookup of the real snapshot is config_bridge::env::lookup");
    assert!(evaluate.contains("env::path_var()"), "the PATH snapshot of the real snapshot is config_bridge::env::path_var()");
    assert!(!evaluate.contains("env::var"), "evaluate.rs goes through env.rs, it does not read the environment itself");

    // The snapshot is a tuple: BOTH values it returns are registered as managed state, after it was taken (the old check, kept).
    let snap = lib.find("config_bridge::snapshot(").expect("config_bridge::snapshot(");
    let tuple_at = lib[..snap].rfind("let (").expect("the snapshot is bound as a tuple");
    let bound = lib[tuple_at..snap].to_string();
    let (startup, registry) = (bound.contains("startup"), bound.contains("external_apps_registry"));
    assert!(startup && registry, "the tuple binds `startup` and `external_apps_registry`: {bound}");
    for name in ["startup", "external_apps_registry"] {
        let managed = lib[snap..].find(&format!(".manage({name})")).or_else(|| lib[snap..].find(&format!("app.manage({name})")));
        assert!(managed.is_some(), "lib.rs must `.manage({name})` AFTER config_bridge::snapshot(..)");
    }
}

// =============================================================================================== ONE process-creation site (SHOULD-212, AC-1520-1)

#[test]
fn only_external_apps_launch_rs_creates_a_process_in_production_code() {
    let mut offenders = Vec::new();
    let mut files = Vec::new();
    rust_files_under(&src(""), &mut files);
    for path in files {
        if is_test_file(&path) || rel(&path) == "src/external_apps/launch.rs" {
            continue;
        }
        let code = strip_cfg_test(&code_only(&read(&path)));
        let compact: String = code.split_whitespace().collect::<Vec<_>>().join(" ");
        let creates = compact.contains("Command::new")
            || compact.contains("process::Command")
            || compact.contains("Command as ")
            || compact.contains("process::*")
            || compact.contains("CommandExt")
            || compact.split("process::{").skip(1).any(|g| g.split('}').next().unwrap_or("").contains("Command"));
        if creates {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "std::process::Command (also under an alias or a full path) only in external_apps/launch.rs: {offenders:?}");
}

#[test]
fn launch_rs_has_exactly_one_command_new_and_hands_it_the_resolved_exe_only() {
    let launch = ext_file("launch.rs");
    let code = code_only(&launch);
    assert_eq!(code.matches("Command::new(").count(), 1, "AC-1520-1: exactly one Command::new in the whole production code");
    let arg = call_args(&launch, "Command::new(").expect("Command::new(..)");
    assert!(!arg.contains("program"), "the registration's `program` string must never reach the process creation: Command::new({arg})");
    assert!(arg.contains("exe"), "Command::new gets the ResolvedExe's path: Command::new({arg})");
    assert!(code.contains(".current_dir("), "R-1545: the working folder is the target's folder");
    assert!(code.contains(".spawn("), "the child is spawned");
}

#[test]
fn launch_rs_connects_no_stdio_waits_for_nothing_and_adds_no_special_handling() {
    let launch = ext_file("launch.rs");
    let code = code_only(&launch);
    assert_eq!(launch.matches("Stdio::null()").count(), 3, "R-1546: stdin, stdout and stderr are all null");
    for stream in [".stdin(", ".stdout(", ".stderr("] {
        assert!(code.contains(stream), "launch.rs must set {stream}Stdio::null())");
    }
    for forbidden in [
        "creation_flags", "CREATE_NEW_CONSOLE", "raw_arg", "ShellExecute", "runas", "Stdio::piped", "Stdio::inherit", ".wait(", ".wait_with_output(",
        ".output(", ".status(", ".try_wait(", ".kill(", "CommandExt",
    ] {
        assert!(!code.contains(forbidden), "launch.rs must not use `{forbidden}` (R-1544 / R-1546 / R-1547 / R-1548, S-3)");
    }
    for shell in ["cmd", "powershell", "pwsh", "/c", "/C", "-Command", "sh"] {
        assert!(!launch.contains(&format!("\"{shell}\"")), "no shell is ever put in front of the program (R-1544): \"{shell}\"");
    }
}

#[test]
fn nothing_in_external_apps_builds_a_command_line_itself() {
    for (name, code) in ext_production() {
        let c = code_only(&code);
        assert!(!c.contains("raw_arg"), "external_apps/{name}: no hand-made command line (R-1544, AC-1534)");
        assert!(!c.contains("creation_flags"), "external_apps/{name}: no creation flags");
    }
}

#[test]
fn resolved_exe_can_only_be_built_inside_program_rs() {
    let program = ext_file("program.rs");
    let code = code_only(&program);
    let compact: String = code.split_whitespace().collect::<Vec<_>>().join(" ");
    let at = compact.find("struct ResolvedExe").expect("program.rs must define `struct ResolvedExe`");
    let decl_end = compact[at..].find(';').map(|e| at + e).unwrap_or(compact.len()).min(at + compact[at..].find('}').unwrap_or(usize::MAX - at));
    let decl = &compact[at..decl_end.min(compact.len())];
    assert!(!decl.contains("pub "), "the field(s) of ResolvedExe must be private so no other module can build one: `{decl}`");
    for (name, other) in ext_production() {
        if name == "program.rs" {
            continue;
        }
        let o: String = code_only(&other).split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(!o.contains("ResolvedExe("), "external_apps/{name} builds a ResolvedExe");
        assert!(!o.contains("ResolvedExe {") || o.contains("-> ResolvedExe {") || o.contains("impl ResolvedExe"), "external_apps/{name} builds a ResolvedExe");
    }
}

// =============================================================================================== the defaults are data (AC-1534)

fn has_path(src: &str, raw: &str) -> bool {
    src.contains(raw) || src.contains(&raw.replace('\\', "\\\\"))
}

#[test]
fn defaults_rs_holds_the_four_registrations_as_data_without_any_japanese() {
    let defaults = ext_file("defaults.rs");
    assert!(!has_cjk(&defaults), "R-1510-1: the backend holds no `name`; the wording is on the screen (W-90..W-93)");
    assert!(defaults.contains("wt.exe"));
    assert!(has_path(&defaults, r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"));
    assert!(has_path(&defaults, r"%SystemRoot%\explorer.exe"));
    assert!(has_path(&defaults, r"%LOCALAPPDATA%\GitHubDesktop\GitHubDesktop.exe"));
    for key in ["Ctrl+Alt+C", "Ctrl+Alt+V", "Ctrl+Alt+E", "Ctrl+Alt+Shift+G"] {
        assert!(defaults.contains(key), "default key {key}");
    }
    for token in ["\"-d\"", "\"{dir}\"", "\"{path}\""] {
        assert!(defaults.contains(token), "args token {token}");
    }
}

#[test]
fn the_explorer_default_is_the_two_element_form_and_never_the_one_element_form() {
    let defaults = ext_file("defaults.rs");
    assert!(defaults.contains("\"/select,\""), "S-2: the first element is exactly `/select,`");
    assert!(!defaults.contains("/select,{path}"), "the one-element form fails with a path that contains a space (spike S-2)");
    let compact: String = defaults.split_whitespace().collect();
    assert!(compact.contains("\"/select,\",\"{path}\""), "the elements are adjacent: [\"/select,\", \"{{path}}\"]");
}

#[test]
fn nothing_outside_defaults_rs_knows_a_default_by_name_or_program() {
    for (name, code) in ext_production() {
        if name == "defaults.rs" {
            continue;
        }
        let lower = code.to_lowercase();
        for word in ["explorer", "wt.exe", "code.exe", "githubdesktop", "github desktop", "/select", "vscode", "vs code", "terminal"] {
            assert!(!lower.contains(word), "external_apps/{name} mentions `{word}`: no branch on a default's name / program (AC-1534)");
        }
    }
}

#[test]
fn the_default_mark_changes_only_where_the_name_comes_from() {
    for name in ["launch.rs", "guarded.rs", "target.rs", "program.rs", "template.rs", "exists.rs", "error.rs"] {
        let c = code_only(&ext_file(name));
        assert!(!c.contains("default_no"), "external_apps/{name} looks at the default mark: launch / target / key / enabled never depend on it (R-1510-1, AC-1534)");
    }
}

#[test]
fn the_registry_is_immutable_and_holds_no_lock() {
    let c = code_only(&ext_file("registry.rs"));
    for forbidden in ["&mut self", "Mutex", "RwLock", "RefCell", "OnceLock", "static mut", "thread_local"] {
        assert!(!c.contains(forbidden), "registry.rs contains `{forbidden}`: the Registry is built once and never changes (R-1501)");
    }
}

#[test]
fn absolute_path_judgement_goes_through_shared_abs_path() {
    let program = code_only(&ext_file("program.rs"));
    assert!(program.contains("abs_path::is_absolute_path_buf("), "R-1540 3: the PATH elements are judged by shared::abs_path (SPEC-0300-0011 R-89-6: one place)");
    for (name, code) in ext_production() {
        assert!(!code_only(&code).contains(".is_absolute()"), "external_apps/{name}: use shared::abs_path, not Path::is_absolute");
    }
}

// =============================================================================================== the commands (R-1581, AC-1524, R-1555)

#[test]
fn the_launch_command_takes_only_index_path_and_kind() {
    let commands = code_only(&ext_file("commands.rs"));
    let params = fn_params(&commands, "external_app_launch").expect("commands.rs must define `fn external_app_launch`");
    let own: Vec<&str> = params.iter().filter(|(_, ty)| !is_injected(ty)).map(|(n, _)| n.as_str()).collect();
    let set: BTreeSet<&str> = own.iter().copied().collect();
    assert_eq!(set, BTreeSet::from(["index", "path", "kind"]), "AC-1524: nothing that names a program or arguments may come in: {params:?}");
    assert_eq!(own.len(), 3);
}

#[test]
fn the_load_command_takes_no_argument_of_its_own() {
    let commands = code_only(&ext_file("commands.rs"));
    let params = fn_params(&commands, "external_apps_load").expect("commands.rs must define `fn external_apps_load`");
    let own: Vec<&String> = params.iter().filter(|(_, ty)| !is_injected(ty)).map(|(n, _)| n).collect();
    assert!(own.is_empty(), "a read-only snapshot command: {params:?}");
}

#[test]
fn both_commands_check_the_calling_window_and_the_launch_one_is_a_thin_shell_over_the_inner_layer() {
    let commands = code_only(&ext_file("commands.rs"));
    assert!(commands.contains("check_main_window("), "R-1555: main window only");
    assert!(commands.contains("launch_guarded("), "R-89-6-1: the command delegates to guarded.rs");
    assert!(!commands.contains("e2e_scope::") && !commands.contains("abs_path::"), "the command fn checks nothing itself (R-89-6-1)");
    assert!(commands.contains("launch::spawn") || commands.contains("spawn"), "the real process creation is handed to the inner layer from the command");
    assert_eq!(commands.matches("#[tauri::command").count(), 2, "exactly the two commands");
}

// =============================================================================================== dependencies, capabilities (AC-1526, §3.16.0)

fn dependency_names(cargo: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let mut in_deps = false;
    for line in cargo.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            in_deps = t.ends_with("dependencies]");
            continue;
        }
        if in_deps && !t.is_empty() && !t.starts_with('#') {
            if let Some((name, _)) = t.split_once('=') {
                names.insert(name.trim().to_string());
            }
        }
    }
    names
}

#[test]
fn no_new_dependency_is_added_and_there_is_no_shell_plugin() {
    let cargo = read(&manifest_dir().join("Cargo.toml"));
    let expected: BTreeSet<String> = [
        "tauri-build", "serde", "toml", "tauri", "trash", "zip", "time", "encoding_rs", "tauri-plugin-opener", "windows-sys", "tempfile",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    assert_eq!(dependency_names(&cargo), expected, "SPEC-0200-0001 §3.16.0: std + serde + toml + windows-sys only; the probe is an example, nothing is added");
    assert!(!cargo.contains("tauri-plugin-shell"), "AC-1526");
    assert!(!cargo.contains("[[bin]]"), "§3.16.10: the test probe is a Cargo example, never a [[bin]] (it would reach `tauri dev` / the installer)");
    let lock = read(&manifest_dir().join("Cargo.lock"));
    assert!(!lock.contains("name = \"tauri-plugin-shell\""), "AC-1526: tauri-plugin-shell is not in the lock either");
}

#[test]
fn no_capability_lets_the_screen_run_a_program() {
    let dir = manifest_dir().join("capabilities");
    let mut seen = 0;
    for entry in fs::read_dir(&dir).expect("capabilities/") {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "json") {
            seen += 1;
            // only the PERMISSION strings count (the `description` field legitimately says "no opener:* permission")
            let full = read(&path);
            let at = full.find("\"permissions\"").unwrap_or_else(|| panic!("{} has no permissions array", rel(&path)));
            let body = &full[at..];
            let list = &body[body.find('[').expect("[")..body.find(']').expect("]")];
            let text = list.to_lowercase();
            for forbidden in ["shell", "allow-execute", "allow-spawn", "allow-kill", "allow-stdin-write", "opener:", "process:allow", "allow-restart"] {
                assert!(!text.contains(forbidden), "{} contains `{forbidden}` (R-1581 / AC-1526: no permission to run an arbitrary program)", rel(&path));
            }
        }
    }
    assert!(seen >= 2, "default.json and viewer.json");
    let tauri_conf = read(&manifest_dir().join("tauri.conf.json")).to_lowercase();
    assert!(!tauri_conf.contains("plugin-shell") && !tauri_conf.contains("\"shell\""), "tauri.conf.json configures no shell plugin");
}

#[test]
fn the_two_permissions_are_granted_to_the_main_window_only() {
    let default = read(&manifest_dir().join("capabilities/default.json"));
    let viewer = read(&manifest_dir().join("capabilities/viewer.json"));
    for p in ["allow-external-apps-load", "allow-external-app-launch"] {
        assert!(default.contains(&format!("\"{p}\"")), "default.json must grant {p}");
        assert!(!viewer.contains(p), "viewer.json must not grant {p} (R-1555: the viewer has no entrance)");
    }
}

// =============================================================================================== the test probe example (MINOR-32; conditional: it is the E2E author's file)

#[test]
fn examples_if_any_forbid_unsafe_and_start_no_process() {
    let dir = manifest_dir().join("examples");
    let Ok(entries) = fs::read_dir(&dir) else { return }; // no examples yet: nothing to check
    let word = ["uns", "afe"].concat();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "rs") {
            let text = read(&path);
            assert!(text.contains(&format!("#![forbid({word}_code)]")), "{} must start with #![forbid({word}_code)] (MINOR-32)", rel(&path));
            let code = code_only(&text);
            assert!(!code.contains(&format!("{word} ")) && !code.contains(&format!("{word}{{")), "{} contains `{word}`", rel(&path));
            assert!(!code.contains("Command"), "{}: the probe records its arguments and exits; it starts nothing (R-1585 4)", rel(&path));
        }
    }
}

// =============================================================================================== the helpers themselves

#[test]
fn helper_scrub_removes_comments_and_optionally_the_string_content() {
    let src = "let a = \"Command::new(x)\"; // Command::new\n/* Command::new */ let b = r#\"x \" y\"#;";
    let blank = code_only(src);
    assert!(!blank.contains("Command"), "{blank}");
    assert!(blank.contains("let a = \"\""));
    let keep = code_with_strings(src);
    assert!(keep.contains("\"Command::new(x)\""), "{keep}");
    assert!(!keep.contains("// Command"), "{keep}");
}

#[test]
fn helper_call_args_finds_the_matching_paren() {
    assert_eq!(call_args("a(b(c), d) e", "a(").as_deref(), Some("b(c), d"));
    assert_eq!(call_args("Command::new(plan.exe.path()).args(x)", "Command::new(").as_deref(), Some("plan.exe.path()"));
    assert_eq!(call_args("nothing", "a("), None);
}

#[test]
fn helper_fn_params_splits_at_top_level_commas() {
    let code = code_only("pub fn f(window: tauri::Window, index: usize, path: String, kind: Kind, cb: impl Fn(&A) -> B) -> R {}");
    let p = fn_params(&code, "f").unwrap();
    assert_eq!(p.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["window", "index", "path", "kind", "cb"]);
    assert!(is_injected(&p[0].1) && !is_injected(&p[1].1));
}

#[test]
fn helper_has_cjk_and_strip_cfg_test() {
    assert!(has_cjk("ターミナル") && has_cjk("開く") && !has_cjk("wt.exe -d {dir}"));
    let stripped = strip_cfg_test(&code_only("fn keep() {}\n#[cfg(test)]\nmod tests { fn gone() {} }\n#[cfg(test)]\nmod more_tests;\nfn also() {}"));
    assert!(stripped.contains("fn keep") && stripped.contains("fn also") && !stripped.contains("gone") && !stripped.contains("more_tests"));
}
