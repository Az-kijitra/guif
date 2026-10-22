//! The second half of the structure tests of the settings-file feature (split from `settings_file_structure_tests.rs` to stay under
//! 400 lines): the E2E launch record, the embedded original, the `lib.rs` wiring and the file-size guides (SPEC-0200-0001 §3.17.4, §3.17.13).

use crate::external_apps_structure_tests::{code_only, code_with_strings, read, src, strip_cfg_test};
use crate::settings_file_structure_tests::{all_production, count, file, production};

#[test]
fn r1681_the_launch_record_is_a_stderr_line_and_never_a_file() {
    // Scrubbed once from the raw text each way (the helpers must not be chained: a raw string such as `r"\\?\\"` would desync a second pass).
    let raw = read(&src("shared/e2e_scope.rs"));
    let code = strip_cfg_test(&code_with_strings(&raw));
    let c = strip_cfg_test(&code_only(&raw));
    for needed in ["pub fn note_settings_launch(", "pub fn settings_launch_line("] {
        assert!(c.contains(needed), "shared/e2e_scope.rs must define `{needed}..`");
    }
    assert_eq!(code.matches("[e2e] settings-file launch: ").count(), 1, "the record prefix the harness reads is written in ONE place");
    for forbidden in ["fs::write", "File::create", "OpenOptions", "fs::File", "e2e-launch-log"] {
        assert!(!c.contains(forbidden), "e2e_scope.rs must not write a record file (`{forbidden}`): R-1614 / SPEC-0400-0001 R-10 stay untouched");
    }
    assert!(c.contains("eprintln!"), "the record goes to standard error");
}

#[test]
fn ac1635_the_original_is_embedded_by_source_rs_only_and_is_comment_only_data() {
    for (path, code) in all_production() {
        let embeds = code.contains("templates/config.sample.toml");
        assert_eq!(embeds, path == "src/settings_file/source.rs", "{path}: only settings_file/source.rs includes the original (R-1637)");
    }
    assert!(count(&file("settings_file/source.rs"), "include_str!(") >= 1);
    let original = read(&src("../templates/config.sample.toml"));
    let n = original.lines().count();
    assert!((100..=600).contains(&n), "the original is data (R-1637; §7.1 allows 600 lines for data): {n} lines");
    for (i, line) in original.lines().enumerate() {
        assert!(line.is_empty() || line.starts_with('#'), "line {}: the original is comments only (R-1612): `{line}`", i + 1);
    }
    assert!(original.contains("#@template ") && original.contains("#@sample ") && original.contains("@VERSION@"), "the markers and the version placeholder (§3.17.3)");
    assert!(!original.starts_with('\u{feff}'));
}

#[test]
fn lib_rs_wires_the_lock_the_handlers_and_the_background_sample_write_after_the_window_is_shown() {
    let lib = code_only(&file("lib.rs"));
    assert!(lib.contains("SettingsFileLock"), "lib.rs must `.manage(settings_file::sample::SettingsFileLock::default())`");
    for command in ["config_bridge::open::settings_file_open", "config_bridge::check::settings_file_check"] {
        assert!(lib.contains(command), "generate_handler! lists {command}");
    }
    let show = lib.find("main.show()").expect("main.show()");
    let start = lib.find("sample_startup::start(").expect("config_bridge::sample_startup::start(..) must be called by lib.rs");
    assert!(start > show, "R-1621 / AC-1624: the sample is written AFTER the first window is shown");
    assert!(!lib.contains("env::var") && !lib.contains("StartupConfig::load(") && !lib.contains("Registry::from_raw("));
}

#[test]
fn s7_file_size_guides_hold() {
    let limit = |rel_path: &str| -> usize {
        match rel_path {
            "src/config/config_toml.rs" | "src/config/startup_config.rs" => 250,
            "src/config/commands.rs" => 300,
            _ => 399,
        }
    };
    let mut files = production("settings_file");
    files.extend(production("config_bridge"));
    files.extend(["config/config_toml.rs", "config/config_toml_lines.rs", "config/startup_config.rs", "config/commands.rs", "external_apps/open_file.rs"].iter().map(|f| (format!("src/{f}"), file(f))));
    for (path, _) in files {
        let n = read(&src(path.trim_start_matches("src/"))).lines().count();
        assert!(n <= limit(&path), "{path} has {n} lines (> {}): split it (SPEC-0200-0001 §7.1, §3.17.13)", limit(&path));
    }
}
