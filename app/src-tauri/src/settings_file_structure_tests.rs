//! TDD (unit-test-writer, 2026-10-20): crate-wide STRUCTURE tests of "設定ファイルを開く / 設定ファイルのチェック" (SPEC-0300-0022 R-1601 /
//! R-1603 / R-1605 / R-1610 / R-1614 / R-1637 / R-1651 / R-1652 / R-1680 / R-1681, AC-1606 / AC-1622 / AC-1635 / AC-1652 (Rust side);
//! SPEC-0200-0001 §3.17.4 items 1-7, §3.17.15, MUST-92 as rewritten by H-1, H-2, H-3). Source-text scans in the style of
//! `external_apps_structure_tests.rs` (whose helpers are shared; honest limit: helper internals are not followed). They read files
//! at RUN time, so they are RED (a failing assertion, not a build error) until the modules exist.
//!
//! The one-line summary of the rewritten MUST-92: `config.toml` has ONE reader (`config/config_toml.rs`) and ONE writer
//! (`settings_file/scaffold.rs::create_template_if_missing`, create-new only). Everything else in `config/`, `config_bridge/` and
//! `settings_file/` is read-only with respect to the settings folder, except the injected sample writer.

use std::collections::BTreeSet;

use crate::external_apps_structure_tests::{call_args, code_only, code_with_strings, crate_uses, files_under, fn_params, is_injected, is_test_file, read, rel, src, strip_cfg_test};

/// `(relative path, production code with strings kept, comments and cfg(test) items removed)` of every non-test file under `sub`.
pub(crate) fn production(sub: &str) -> Vec<(String, String)> {
    let files = files_under(sub);
    assert!(!files.is_empty(), "src/{sub}/ does not exist yet (RED until it is implemented)");
    files.into_iter().filter(|p| !is_test_file(p)).map(|p| (rel(&p), strip_cfg_test(&code_with_strings(&read(&p))))).collect()
}

pub(crate) fn file(rel_path: &str) -> String {
    let path = src(rel_path);
    assert!(path.is_file(), "src/{rel_path} must exist (RED until it is implemented)");
    strip_cfg_test(&code_with_strings(&read(&path)))
}

pub(crate) fn count(code: &str, token: &str) -> usize {
    code_only(code).matches(token).count()
}

pub(crate) fn all_production() -> Vec<(String, String)> {
    files_under("").into_iter().filter(|p| !is_test_file(p)).map(|p| (rel(&p), strip_cfg_test(&code_with_strings(&read(&p))))).collect()
}

// =============================================================================================== wiring

fn declares_behind_cfg_test(mod_rs: &str, name: &str) -> bool {
    mod_rs.find(&format!("mod {name};")).is_some_and(|at| mod_rs[..at].trim_end().ends_with("#[cfg(test)]"))
}

#[test]
fn the_new_modules_and_their_test_modules_are_wired() {
    let lib = code_with_strings(&read(&src("lib.rs")));
    for item in ["pub mod settings_file;", "pub mod config_bridge;"] {
        assert!(lib.contains(item), "lib.rs must declare `{item}`");
    }
    for test in ["settings_file_structure_tests", "acl_consistency_bridge_tests"] {
        assert!(declares_behind_cfg_test(&lib, test), "lib.rs must declare #[cfg(test)] `mod {test};`");
    }
    let wired: [(&str, &[&str], &[&str]); 5] = [
        ("settings_file/mod.rs", &["source", "scaffold", "sample", "editor", "open"], &["source_tests", "scaffold_tests", "sample_tests", "editor_tests", "open_tests"]),
        (
            "config_bridge/mod.rs",
            &["env", "evaluate", "check", "open", "sample_startup"],
            &["env_tests", "evaluate_tests", "check_tests", "open_tests", "sample_startup_tests", "template_consistency_tests"],
        ),
        (
            "config/mod.rs",
            &["config_toml_lines", "startup_config"],
            // SPEC-0300-0023: `startup_config_lines_tests` is replaced by `startup_config_snapshot_tests` (appearance_structure_tests wires the rest)
            // (the lines / load tests were migrated to `config_toml_lines_keys_tests` / `config_toml_load_keys_tests` for SPEC-0300-0023)
            &["config_toml_inline_tests", "config_toml_lines_keys_tests", "config_toml_load_keys_tests"],
        ),
        ("shared/mod.rs", &[], &["e2e_scope_settings_tests"]),
        ("shared/schema/mod.rs", &["config_lines"], &[]),
    ];
    for (mod_file, modules, tests) in wired {
        let mod_rs = code_with_strings(&read(&src(mod_file)));
        let dir = mod_file.trim_end_matches("mod.rs");
        for module in modules {
            assert!(mod_rs.contains(&format!("mod {module};")), "{mod_file} must declare `mod {module};`");
            assert!(src(&format!("{dir}{module}.rs")).is_file(), "src/{dir}{module}.rs must exist");
        }
        for test in tests {
            assert!(declares_behind_cfg_test(&mod_rs, test), "{mod_file} must declare #[cfg(test)] `mod {test};`");
            assert!(src(&format!("{dir}{test}.rs")).is_file(), "src/{dir}{test}.rs must exist");
        }
    }
    assert!(src("../templates/config.sample.toml").is_file(), "the original app/src-tauri/templates/config.sample.toml must exist (R-1637)");
}

// =============================================================================================== item 7: what may sit in config_bridge/

#[test]
fn config_bridge_holds_exactly_the_six_designed_files() {
    let names: BTreeSet<String> = production("config_bridge").into_iter().map(|(p, _)| p.rsplit('/').next().unwrap().to_string()).collect();
    let expected: BTreeSet<String> = ["mod.rs", "env.rs", "evaluate.rs", "check.rs", "open.rs", "sample_startup.rs"].iter().map(|s| s.to_string()).collect();
    assert_eq!(names, expected, "config_bridge/ is the bootstrap's part (H-2): adding a file means amending SPEC-0200-0001 §3.17 first");
}

// =============================================================================================== item 1: ONE writer of config.toml

#[test]
fn must92_create_new_is_used_by_scaffold_rs_only() {
    for (path, code) in all_production() {
        // The user-file operations (`archive/temp.rs` makes its temporary entries, `fs_ops/create.rs` the new file or folder the user asked
        // for) create-new inside the folders the user is working in, under their own absolute-path and E2E-scope checks. The rule is about
        // the code that can reach the SETTINGS folder: `config/`, `config_bridge/`, `settings_file/` and the rest.
        // An explicit list of the files that really use it, not whole folders.
        if ["src/archive/temp.rs", "src/fs_ops/create.rs"].contains(&path.as_str()) {
            continue;
        }
        let uses = count(&code, "create_new(") > 0;
        assert_eq!(uses, path == "src/settings_file/scaffold.rs", "`create_new(` belongs to settings_file/scaffold.rs and nowhere else: {path}");
    }
}

#[test]
fn must92_scaffold_rs_can_only_create_and_remove_what_it_created() {
    let code = file("settings_file/scaffold.rs");
    assert!(count(&code, "OpenOptions") >= 1, "scaffold.rs builds its file with OpenOptions");
    assert_eq!(count(&code, "OpenOptions::new()"), 1);
    for forbidden in [".truncate(", ".append(", "fs::write", "File::create", "fs::rename", "rename(", "atomic_write", "set_permissions", "fs::copy", "create_dir"] {
        assert!(!code_only(&code).contains(forbidden), "scaffold.rs must not use `{forbidden}`: it only creates a NEW file (R-1610) and never opens an existing one for writing");
    }
    assert_eq!(count(&code, "remove_file("), 1, "R-1613: ONE removal, in the failure branch");
    let args = call_args(&code, "remove_file(").expect("remove_file(..)");
    assert!(args.trim().starts_with('&') || args.contains("path"), "the removal's argument is the path this function created: {args}");
    assert!(code.contains(".create_new(true)") && code.contains("sync_all"), "R-1610: create-new, one flushed write");
    assert!(code.contains("symlink_metadata"), "R-1601: ANYTHING at the path (file, folder, link) counts as present");
}

// =============================================================================================== item 2: write words are limited

#[test]
fn config_toml_and_its_lines_module_have_no_write_words() {
    // SPEC-0300-0023 (SPEC-0200-0001 §3.18.10): `config/appearance_raw.rs` reads the appearance tables and has no write word either.
    for f in ["config/config_toml.rs", "config/config_toml_lines.rs", "config/appearance_raw.rs"] {
        let code = code_only(&file(f));
        for token in ["fs::write", "File::create", "OpenOptions", "rename", "remove_file", "atomic_write", "create_dir", "set_permissions"] {
            assert!(!code.contains(token), "{f} must not contain `{token}` (config.toml has one READER, R-1645)");
        }
    }
}

#[test]
fn write_words_in_config_bridge_and_settings_file_are_confined_to_the_designed_places() {
    let banned = ["fs::write", "File::create", "OpenOptions", "create_new(", "rename(", "remove_file(", "remove_dir", "atomic_write", "create_dir", "set_permissions", "fs::copy", ".truncate(", ".append("];
    let mut files = production("settings_file");
    files.extend(production("config_bridge"));
    // SPEC-0300-0023 (SPEC-0200-0001 §3.18.10): `appearance/` has none of these words either (it is pure; nothing in it is "allowed" below).
    files.extend(production("appearance"));
    for (path, code) in files {
        let c = code_only(&code);
        for token in banned {
            if !c.contains(token) {
                continue;
            }
            let allowed = match token {
                "OpenOptions" | "create_new(" | "remove_file(" => path == "src/settings_file/scaffold.rs",
                "atomic_write" => {
                    // injected as a function VALUE (`&atomic_write`, `config::atomic::atomic_write`), never called
                    (path == "src/config_bridge/open.rs" || path == "src/config_bridge/sample_startup.rs") && !c.contains("atomic_write(")
                }
                _ => false,
            };
            assert!(allowed, "{path} uses `{token}`: only the designed place may (§3.17.4 item 2, AC-1606)");
        }
    }
}

#[test]
fn atomic_write_is_handed_over_in_exactly_the_two_bridge_files() {
    for f in ["config_bridge/open.rs", "config_bridge/sample_startup.rs"] {
        assert!(code_only(&file(f)).contains("atomic_write"), "{f} injects config::atomic::atomic_write into write_sample_if_stale (R-1622)");
    }
    let atomic = file("config/atomic.rs"); // strings kept: the literal `".tmp"` is the point
    assert!(atomic.contains("push(\".tmp\")") || atomic.contains("\".tmp\""), "the temporary name stays `<target>.tmp` = config.sample.toml.tmp (AC-1622)");
}

// =============================================================================================== item 3: the sample writer cannot touch config.toml

#[test]
fn sample_rs_names_only_the_sample_file_and_never_receives_config_toml() {
    let code = file("settings_file/sample.rs");
    let c = code_only(&code);
    assert!(!code.contains("config.toml") && !c.contains("CONFIG_FILE"), "sample.rs must not name config.toml (R-1614, §3.17.4 item 3)");
    assert!(c.contains("SAMPLE_FILE"), "the only file name it uses is SAMPLE_FILE");
    let params = fn_params(&code, "write_sample_if_stale").expect("write_sample_if_stale");
    assert_eq!(params.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["dir", "contents", "write"], "(dir, contents, write): no config.toml path parameter");
}

// =============================================================================================== item 4: dependency direction

#[test]
fn settings_file_depends_on_shared_and_std_only() {
    let mut offenders = Vec::new();
    for (path, code) in production("settings_file") {
        let c = code_only(&code);
        for used in crate_uses(&c) {
            if used != "shared" && used != "settings_file" {
                offenders.push(format!("{path}: crate::{used}"));
            }
        }
        for token in ["tauri", "Command", "env::var", "env::vars", "current_dir", "process::"] {
            if c.contains(token) {
                offenders.push(format!("{path}: `{token}`"));
            }
        }
        if c.contains(&["super", "::", "super", "::"].concat()) {
            offenders.push(format!("{path}: parent-of-parent module path"));
        }
    }
    assert!(offenders.is_empty(), "settings_file/ uses shared/ and std only, no Tauri type, no environment, no process:\n  {}", offenders.join("\n  "));
}

#[test]
fn only_lib_rs_uses_config_bridge_and_only_it_and_the_bridge_use_settings_file() {
    let mut offenders = Vec::new();
    for (path, code) in all_production() {
        let c = code_only(&code);
        let uses = |name: &str| crate_uses(&c).iter().any(|u| u == name) || c.contains(&format!("super::{name}"));
        let in_bridge = path.starts_with("src/config_bridge/");
        if uses("config_bridge") && path != "src/lib.rs" && !in_bridge {
            offenders.push(format!("{path} uses config_bridge"));
        }
        if uses("settings_file") && path != "src/lib.rs" && !in_bridge && !path.starts_with("src/settings_file/") {
            offenders.push(format!("{path} uses settings_file"));
        }
    }
    assert!(offenders.is_empty(), "config_bridge/ is imported by lib.rs only (H-2); settings_file/ by lib.rs and config_bridge/ only:\n  {}", offenders.join("\n  "));
}

#[test]
fn config_and_external_apps_never_use_the_new_modules_and_stay_apart() {
    let mut offenders = Vec::new();
    for dir in ["config", "external_apps", "shared", "fs", "fs_ops", "archive", "viewer"] {
        for path in files_under(dir).into_iter().filter(|p| !is_test_file(p)) {
            let c = code_only(&read(&path));
            // SPEC-0300-0023: the appearance feature is imported by lib.rs and config_bridge/ only (appearance_structure_tests.rs checks the whole crate)
            for forbidden in ["settings_file", "config_bridge", "appearance"] {
                if crate_uses(&c).iter().any(|u| u == forbidden) {
                    offenders.push(format!("{}: crate::{forbidden}", rel(&path)));
                }
            }
        }
    }
    assert!(offenders.is_empty(), "{offenders:?}");
}

// =============================================================================================== item 5: start-up and check share ONE function

#[test]
fn evaluate_rs_alone_calls_startup_config_load_and_the_registry_builder() {
    for (path, code) in all_production() {
        if path == "src/config_bridge/evaluate.rs" {
            continue;
        }
        let c = code_only(&code);
        assert!(!c.contains("StartupConfig::load("), "{path}: `StartupConfig::load(` is called by config_bridge/evaluate.rs only (R-1651)");
        assert!(!c.contains("Registry::from_raw("), "{path}: `Registry::from_raw(` is called by config_bridge/evaluate.rs only (R-1651)");
    }
    let evaluate = file("config_bridge/evaluate.rs");
    assert!(code_only(&evaluate).contains("StartupConfig::"), "evaluate.rs builds the start-up snapshot");
    assert_eq!(count(&evaluate, "Registry::from_raw("), 1);
}

#[test]
fn lib_rs_and_check_rs_both_go_through_snapshot_and_check_rs_manages_and_writes_nothing() {
    let lib = file("lib.rs");
    assert!(code_only(&lib).contains("config_bridge::snapshot("), "lib.rs: start-up uses config_bridge::snapshot(..)");
    let check = file("config_bridge/check.rs");
    assert!(code_only(&check).contains("snapshot"), "check.rs: the check uses the same evaluate::snapshot* function (AC-1652)");
    let c = code_only(&check);
    for forbidden in [".manage(", "fs::write", "File::create", "atomic_write", "OpenOptions", "write_sample_if_stale", "create_template_if_missing", "interpret_ui_theme", "validate(", "set_theme", "apply_background", "window_paint"] {
        assert!(!c.contains(forbidden), "check.rs must not use `{forbidden}`: it reads, does not reflect (R-1652), and has no checker of its own (R-1651)");
    }
    assert!(c.contains("to_dto(") && c.contains("registry_dto(") && c.contains("appearance_dto("), "the check returns the same DTOs as start-up (SPEC-0300-0023: appearance included)");
}

#[test]
fn m1_config_path_is_resolved_through_locate_by_every_user() {
    let startup = file("config/startup_config.rs");
    assert!(code_only(&startup).contains("pub fn locate("), "config/startup_config.rs::locate is the one place that resolves the config.toml path");
    for f in ["config_bridge/open.rs", "config_bridge/sample_startup.rs"] {
        let c = code_only(&file(f));
        assert!(c.contains("locate("), "{f} resolves the folder through config::startup_config::locate");
        assert!(!c.contains("config_path(") && !c.contains("app_config_dir") && !c.contains("config_dir_override"), "{f} must not resolve the path itself");
    }
}

// =============================================================================================== item 6: the commands, the launch sites

fn command_params(code: &str, name: &str) -> Vec<String> {
    fn_params(code, name).unwrap_or_else(|| panic!("fn {name} must exist")).into_iter().map(|(n, _)| n).collect()
}

#[test]
fn ac1606_the_two_commands_take_a_window_and_an_app_handle_and_nothing_else() {
    let open = file("config_bridge/open.rs");
    let check = file("config_bridge/check.rs");
    assert_eq!(command_params(&open, "settings_file_open"), ["window", "app"], "R-1605: no path / program / argument parameter");
    assert_eq!(command_params(&check, "settings_file_check"), ["window", "app"]);
    for (code, name) in [(&open, "settings_file_open"), (&check, "settings_file_check")] {
        for (pname, ty) in fn_params(code, name).unwrap() {
            assert!(is_injected(&ty), "{name}: `{pname}: {ty}` is a user-supplied parameter");
        }
        assert!(code_only(code).contains("label()"), "{name}: the calling window is checked (main only)");
    }
}

#[test]
fn ac1606_tauri_plugin_opener_is_used_in_viewer_commands_and_config_bridge_open_only() {
    let mut users: Vec<String> = all_production().into_iter().filter(|(_, c)| code_only(c).contains("tauri_plugin_opener")).map(|(p, _)| p).collect();
    users.sort();
    assert_eq!(users, ["src/config_bridge/open.rs", "src/viewer/commands.rs"], "SHOULD-212 as rewritten by §3.17.15");
    let open = code_only(&file("config_bridge/open.rs"));
    let (scope, launch) = (open.find("check_external_launch(").expect("check_external_launch( before the association"), open.find("open_path(").expect("tauri_plugin_opener::open_path("));
    assert!(scope < launch, "S-3: the association function checks the E2E scope itself before opening");
    assert!(open.contains("note_settings_launch"), "AC-1608: the launch record is written through e2e_scope::note_settings_launch");
}

#[test]
fn ac1606_no_code_cmd_no_shell_no_command_line_in_the_new_modules() {
    let mut files = production("settings_file");
    files.extend(production("config_bridge"));
    for (path, code) in files {
        for forbidden in ["\"code\"", "code.cmd", "\"cmd\"", "cmd.exe", "powershell", "pwsh", "ShellExecute", "\"/c\"", "Command::new", "process::Command"] {
            assert!(!code.contains(forbidden), "{path} contains `{forbidden}`: no `code`, no shell, no process creation outside external_apps/launch.rs (R-1602 / R-1603)");
        }
        for token in ["DEFAULT_APPS", "DEFAULT_KEYMAP"] {
            assert!(!code.contains(token), "{path} reads defaults at run time (`{token}`): the text comes from the original only (R-1637, AC-1635)");
        }
    }
}

#[test]
fn h3_open_file_with_has_one_caller_and_is_fed_the_editor_candidate_and_the_real_spawn() {
    let mut callers = Vec::new();
    for (path, code) in all_production() {
        if path != "src/external_apps/open_file.rs" && code_only(&code).contains("open_file_with(") {
            callers.push(path);
        }
    }
    assert_eq!(callers, ["src/config_bridge/open.rs"], "the single caller of open_file_with");
    let open = file("config_bridge/open.rs");
    let args = call_args(&open, "open_file_with(").expect("open_file_with(..)");
    assert!(args.contains("spawn") && args.contains("probe"), "launch::spawn and exists::probe are injected: {args}");
    assert!(code_only(&file("settings_file/open.rs")).contains("vscode_candidate("), "the program is settings_file::editor::vscode_candidate's value (R-1602)");

    let open_file = code_only(&file("external_apps/open_file.rs"));
    let (scope, spawn) = (open_file.find("check_external_launch(").expect("open_file.rs checks the E2E scope"), open_file.find("spawn(").expect("spawn("));
    assert!(scope < spawn, "R-1681 / S-3: the scope is checked BEFORE spawn, whatever the caller did");
    assert!(open_file.contains("program::resolve(") || open_file.contains("resolve("), "open_file_with reuses program::resolve");
    assert!(!open_file.contains("Command"), "no process creation of its own (launch.rs is the only site)");
}

