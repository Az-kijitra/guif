//! TDD (unit-test-writer, 2026-10-24): crate-wide STRUCTURE tests of the appearance feature (SPEC-0300-0023 R-1721 / R-1743 / R-1748 / R-1749;
//! AC-1726 / AC-1749 (Rust half); SPEC-0200-0001 §3.18.3 (dependency), §3.18.10 (structure tests), §3.18.11, §3.18.12 (sizes), §3.18.15 MUST-1 /
//! MUST-2 / MUST-3 / SHOULD-1 / SHOULD-6). Source-text scans in the style of `settings_file_structure_tests.rs` (whose helpers are shared; honest
//! limit: helper internals are not followed). They read files at RUN time, so they are RED (a failing assertion, not a build error) until the
//! module exists. The wiring of `lib.rs` / `window_theme.rs` / the viewer window / the three-place command registration is in
//! `appearance_wiring_tests.rs`.
//!
//! In one sentence: `appearance/` is a vertical slice that imports `shared` and `std` (and `serde` for its DTOs); only `appearance/commands.rs`
//! names `tauri`; only `lib.rs` and `config_bridge/` import it; the key names are defined once in `shared/schema/appearance_raw.rs`; colour
//! literals live in four files; the OS-following theme is gone from the production code.

use std::collections::BTreeSet;

use crate::external_apps_structure_tests::{code_only, code_with_strings, crate_uses, files_under, fn_params, is_injected, is_test_file, read, rel, src, strip_cfg_test};
use crate::settings_file_structure_tests::{all_production, count, file, production};

fn declares_behind_cfg_test(mod_rs: &str, name: &str) -> bool {
    mod_rs.find(&format!("mod {name};")).is_some_and(|at| mod_rs[..at].trim_end().ends_with("#[cfg(test)]"))
}

/// `"#rgb"` / `"#rrggbb"` as a string literal, or an `rgba(` function.
fn has_colour_literal(code: &str) -> bool {
    if code.contains("rgba(") {
        return true;
    }
    code.match_indices("\"#").any(|(i, _)| {
        let digits = code[i + 2..].chars().take_while(char::is_ascii_hexdigit).count();
        matches!(digits, 3 | 6) && code[i + 2 + digits..].starts_with('"')
    })
}

fn mod_rs(path: &str) -> String {
    code_with_strings(&read(&src(path)))
}

// =============================================================================================== wiring (SHOULD-1)

#[test]
fn the_appearance_module_and_every_test_module_are_wired() {
    let lib = mod_rs("lib.rs");
    assert!(lib.contains("pub mod appearance;"), "lib.rs must declare `pub mod appearance;`");
    for test in ["appearance_structure_tests", "appearance_wiring_tests"] {
        assert!(declares_behind_cfg_test(&lib, test), "lib.rs must declare #[cfg(test)] `mod {test};`");
        assert!(src(&format!("{test}.rs")).is_file());
    }
    let appearance = mod_rs("appearance/mod.rs");
    for module in ["color", "presets", "resolve", "font", "vars", "highlight", "dto", "commands", "paint"] {
        assert!(appearance.contains(&format!("mod {module};")), "appearance/mod.rs must declare `mod {module};`");
        assert!(src(&format!("appearance/{module}.rs")).is_file(), "src/appearance/{module}.rs must exist");
    }
    for test in [
        "test_support", "color_tests", "presets_tests", "resolve_tests", "resolve_colors_tests", "resolve_layout_tests", "font_tests", "vars_tests",
        "highlight_tests", "contrast_tests", "paint_tests", "commands_tests",
    ] {
        assert!(declares_behind_cfg_test(&appearance, test), "appearance/mod.rs must declare #[cfg(test)] `mod {test};`");
        assert!(src(&format!("appearance/{test}.rs")).is_file(), "{test}.rs must exist");
    }
    assert!(appearance.contains("pub use resolve::") || appearance.contains("pub use self::resolve::"), "`appearance::resolve(..)` is re-exported at the root (config_bridge calls it by that path)");
    let others: [(&str, &[&str], &[&str]); 4] = [
        (
            "config/mod.rs",
            &["appearance_raw"],
            &[
                "config_toml_appearance_tests", "config_toml_appearance_lines_tests", "startup_config_snapshot_tests", "config_toml_lines_keys_tests", "config_toml_load_keys_tests",
                "config_toml_external_apps_raw_tests",
            ],
        ),
        ("config_bridge/mod.rs", &[], &["appearance_snapshot_tests", "template_appearance_tests"]),
        ("shared/mod.rs", &["window_paint"], &["window_paint_tests"]),
        ("shared/schema/mod.rs", &["appearance_raw"], &["appearance_raw_tests"]),
    ];
    for (file_name, modules, tests) in others {
        let text = mod_rs(file_name);
        let dir = file_name.trim_end_matches("mod.rs");
        for module in modules {
            assert!(text.contains(&format!("mod {module};")), "{file_name} must declare `mod {module};`");
            assert!(src(&format!("{dir}{module}.rs")).is_file(), "src/{dir}{module}.rs must exist");
        }
        for test in tests {
            assert!(declares_behind_cfg_test(&text, test), "{file_name} must declare #[cfg(test)] `mod {test};`");
            assert!(src(&format!("{dir}{test}.rs")).is_file(), "{test}.rs must exist");
        }
    }
}

#[test]
fn the_theme_modules_and_the_tests_of_the_os_following_theme_are_gone() {
    for gone in ["shared/schema/ui_theme.rs", "shared/schema/ui_theme_tests.rs", "shared/window_theme_tests.rs", "config/config_toml_tests.rs", "config/startup_config_tests.rs", "config/startup_config_lines_tests.rs",
        "config/config_toml_lines_tests.rs", "config/config_toml_load_lines_tests.rs", "config/config_toml_external_apps_tests.rs"] {
        assert!(!src(gone).exists(), "src/{gone} must be deleted (SPEC-0300-0023: replaced by the files of the hand-over list)");
    }
    for (mod_file, word) in [("shared/schema/mod.rs", "ui_theme"), ("config/mod.rs", "config_toml_tests"), ("config/mod.rs", "startup_config_tests"), ("config/mod.rs", "config_toml_lines_tests"), ("config/mod.rs", "config_toml_load_lines_tests"), ("config/mod.rs", "config_toml_external_apps_tests"), ("shared/mod.rs", "window_theme_tests")] {
        assert!(!mod_rs(mod_file).contains(word), "{mod_file} must not mention `{word}` any more");
    }
}

// =============================================================================================== dependency direction (H-1, MUST-2)

#[test]
fn appearance_imports_shared_and_std_only_and_serde_for_its_dtos() {
    let mut offenders = Vec::new();
    for (path, code) in production("appearance") {
        let c = code_only(&code);
        for used in crate_uses(&c) {
            if used != "shared" && used != "appearance" {
                offenders.push(format!("{path}: crate::{used}"));
            }
        }
        for line in code_with_strings(&code).lines().map(str::trim).filter(|l| l.starts_with("use ")) {
            let first: String = line["use ".len()..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            let allowed = ["std", "core", "alloc", "serde", "crate", "super", "self"].contains(&first.as_str()) || (first == "tauri" && path.ends_with("/commands.rs"));
            if !allowed {
                offenders.push(format!("{path}: `{line}`"));
            }
        }
        let win32 = ["windows", "_sys"].concat();
        for token in ["toml::", "serde_json", "zip::", "trash::", win32.as_str(), "encoding_rs", "tauri_plugin"] {
            if c.contains(token) {
                offenders.push(format!("{path}: `{token}`"));
            }
        }
    }
    assert!(offenders.is_empty(), "appearance/ depends on shared/ and std only (+ serde for DTOs; + tauri in commands.rs):\n  {}", offenders.join("\n  "));
}

#[test]
fn only_commands_rs_names_tauri_and_it_defines_exactly_one_main_window_command() {
    for (path, code) in production("appearance") {
        let c = code_only(&code);
        if path.ends_with("/commands.rs") {
            assert!(c.contains("tauri"), "commands.rs holds the #[tauri::command]");
        } else {
            assert!(!c.contains("tauri"), "{path}: Tauri types are allowed in appearance/commands.rs only (MUST-2)");
        }
    }
    let commands = file("appearance/commands.rs");
    assert_eq!(count(&commands, "#[tauri::command"), 1, "one command: appearance_load");
    let params = fn_params(&commands, "appearance_load").expect("fn appearance_load");
    assert_eq!(params.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["window", "state"], "no path / value parameter at all");
    assert!(params.iter().all(|(_, ty)| is_injected(ty)), "{params:?}");
    assert!(code_only(&commands).contains("label()"), "the calling window is checked: main only (R-1555 style)");
}

#[test]
fn appearance_reads_no_environment_file_process_or_embedded_file() {
    for (path, code) in production("appearance") {
        let c = code_only(&code);
        let unsafe_word = ["uns", "afe"].concat();
        for token in ["env::var", "env::vars", "std::env", "current_dir", "fs::", "File::", "OpenOptions", "Command", "process::", "include_str!", "include_bytes!", unsafe_word.as_str(), "thread::", "Mutex", "static mut"] {
            assert!(!c.contains(token), "{path}: `{token}` -- appearance/ is pure (no I/O, no clock, no state); the CSS fallback is read in font_tests.rs only (MUST-1)");
        }
    }
}

#[test]
fn font_tests_reads_app_css_with_include_str_inside_the_test_module_only() {
    let font_tests = read(&src("appearance/font_tests.rs"));
    assert!(font_tests.contains("include_str!(") && font_tests.contains("app.css"), "font_tests.rs reads app/src/app.css (the fallback of --ui-font, --ui-font-size, --list-row-height)");
    assert!(declares_behind_cfg_test(&mod_rs("appearance/mod.rs"), "font_tests"), "the module that reads it is #[cfg(test)]");
    for path in files_under("appearance") {
        if !rel(&path).ends_with("font_tests.rs") && !is_test_file(&path) {
            assert!(!code_only(&read(&path)).contains("include_str!"), "{}: no embedded file in production code", rel(&path));
        }
    }
}

#[test]
fn nothing_but_lib_rs_and_config_bridge_imports_appearance() {
    let mut offenders = Vec::new();
    for (path, code) in all_production() {
        if path.starts_with("src/appearance/") || path == "src/lib.rs" || path.starts_with("src/config_bridge/") {
            continue;
        }
        let c = code_only(&code);
        if crate_uses(&c).iter().any(|u| u == "appearance") || c.contains("appearance::") {
            offenders.push(path);
        }
    }
    assert!(offenders.is_empty(), "appearance/ is imported by lib.rs and config_bridge/ only (the viewer gets shared::window_paint::WindowPaint): {offenders:?}");
    for dir in ["config", "external_apps", "settings_file", "viewer", "shared", "fs", "fs_ops", "archive"] {
        for path in files_under(dir).into_iter().filter(|p| !is_test_file(p)) {
            assert!(!crate_uses(&code_only(&read(&path))).iter().any(|u| u == "appearance"), "{} must not import appearance", rel(&path));
        }
    }
}

#[test]
fn resolve_is_called_in_one_place_of_the_production_code() {
    let mut sites = Vec::new();
    for (path, code) in all_production() {
        let n = code_only(&code).matches("appearance::resolve(").count();
        if n > 0 {
            sites.push((path, n));
        }
    }
    assert_eq!(sites, [("src/config_bridge/evaluate.rs".to_string(), 1)], "start-up and the check share ONE evaluation (R-1651); `appearance::resolve(` is called there once");
}

#[test]
fn the_colour_grammar_and_the_colour_arithmetic_are_defined_in_appearance_only() {
    let defs = ["fn parse_color(", "fn contrast(", "fn luminance(", "fn xterm_256(", "fn normalize_preset_name("];
    for (path, code) in all_production() {
        for def in defs {
            let at_home = match def {
                "fn normalize_preset_name(" => path == "src/appearance/presets.rs",
                _ => path == "src/appearance/color.rs",
            };
            assert_eq!(code_only(&code).contains(def), at_home, "{path}: `{def}` belongs to appearance/{} only (one implementation; TS has none)", if def.contains("preset") { "presets.rs" } else { "color.rs" });
        }
    }
}

// =============================================================================================== MUST-1: where colour values may be written

#[test]
fn colour_literals_in_appearance_live_in_four_files_only() {
    let allowed: BTreeSet<&str> = ["src/appearance/presets.rs", "src/appearance/color.rs", "src/appearance/highlight.rs", "src/appearance/vars.rs"].into_iter().collect();
    for (path, code) in production("appearance") {
        assert!(!(has_colour_literal(&code) && !allowed.contains(path.as_str())), "{path}: colour values are written in presets.rs, color.rs, highlight.rs and vars.rs only (AC-905's exception, §3.18.2)");
    }
    for needed in allowed.iter().filter(|p| p.ends_with("presets.rs") || p.ends_with("vars.rs")) {
        assert!(has_colour_literal(&file(needed.trim_start_matches("src/"))), "{needed} is where colours are written");
    }
}

#[test]
fn window_theme_and_window_paint_hold_no_colour_constant() {
    let theme = code_with_strings(&read(&src("shared/window_theme.rs")));
    assert!(!has_colour_literal(&theme) && !theme.contains("0x"), "the four colour constants of R-919-1 are gone: the colour is an argument (R-1742)");
    let paint = code_with_strings(&read(&src("shared/window_paint.rs")));
    assert!(!has_colour_literal(&paint) && !paint.contains("0x"));
    assert!(!code_only(&paint).contains("tauri"), "shared/window_paint.rs is pure data");
    let n = read(&src("shared/window_paint.rs")).lines().count();
    assert!((20..=80).contains(&n), "shared/window_paint.rs has {n} lines (§3.18.12: about 30; not under 20)");
}

// =============================================================================================== MUST-3: one definition of the names

#[test]
fn the_key_names_are_defined_once_in_the_schema_and_used_from_there() {
    let unique = [
        "border_inactive", "cursor_fg", "cursor_bg", "status_bar_fg", "status_bar_bg", "menu_bar_active_fg", "menu_bar_active_bg", "tree_current", "tree_cursor",
        "selected_mark", "background", "min_col_width", "tree_width_percent", "preset",
    ];
    for (path, code) in all_production() {
        if path == "src/shared/schema/appearance_raw.rs" {
            continue;
        }
        let text = strip_cfg_test(&code);
        for name in unique {
            assert!(!text.contains(&format!("\"{name}\"")), "{path}: the literal \"{name}\" belongs to shared/schema/appearance_raw.rs (MUST-3); use its constants");
        }
    }
    let schema = file("shared/schema/appearance_raw.rs");
    for name in unique {
        assert!(schema.contains(&format!("\"{name}\"")), "appearance_raw.rs defines \"{name}\"");
    }
    for definition in ["const COLOR_KEYS", "const THEME_KEYS", "const FONT_KEYS", "const LAYOUT_KEYS", "const COLOR_ALIASES"] {
        let homes: Vec<String> = all_production().into_iter().filter(|(_, c)| code_only(c).contains(definition)).map(|(p, _)| p).collect();
        assert_eq!(homes, ["src/shared/schema/appearance_raw.rs"], "`{definition}` is defined once");
    }
    let homes: Vec<String> = all_production().into_iter().filter(|(_, c)| code_only(c).contains("const KNOWN_TOP_KEYS")).map(|(p, _)| p).collect();
    assert_eq!(homes, ["src/shared/schema/config_lines.rs"], "the known top-level keys (not only the appearance ones) are defined in config_lines.rs");
}

#[test]
fn the_readers_and_the_resolver_use_the_shared_constants() {
    for f in ["config/appearance_raw.rs", "config/config_toml_lines.rs", "appearance/resolve.rs", "appearance/presets.rs"] {
        assert!(file(f).contains("appearance_raw"), "{f} must use the constants of shared::schema::appearance_raw (SHOULD-B)");
    }
    for f in ["config/config_toml.rs", "config/config_toml_lines.rs"] {
        assert!(code_only(&file(f)).contains("KNOWN_TOP_KEYS"), "{f}: the known top-level keys come from config_lines.rs (the two lists of today are one)");
        assert!(!code_only(&file(f)).contains("\"ui_theme\""), "{f}: ui_theme is not a known key any more");
    }
}

#[test]
fn the_reader_of_the_appearance_judges_nothing() {
    let reader = code_only(&file("config/appearance_raw.rs"));
    for token in ["parse_color", "lookup_preset", "normalize_preset_name", "contrast(", "luminance(", "..=", "to_ascii_lowercase", "trim(", "fs::write", "File::create", "OpenOptions", "rename", "remove_file", "atomic_write"] {
        assert!(!reader.contains(token), "config/appearance_raw.rs must not contain `{token}`: it reads raw values and lines (the judging is appearance/'s, MUST-86)");
    }
    let n = read(&src("config/appearance_raw.rs")).lines().count();
    assert!(n <= 200, "config/appearance_raw.rs has {n} lines (design: <= 200)");
}

// =============================================================================================== AC-1749 / SHOULD-6 (Rust half)

#[test]
fn ac1749_no_production_code_follows_the_os_theme_or_interprets_ui_theme() {
    let banned = [
        "ThemeChanged", "UiThemeRaw", "interpret_ui_theme", "ThemeSetting", "ThemeResolution", "requested_theme", "WindowKind", "background_rgb",
        "ui_theme", "prefers-color-scheme", "prefers_color_scheme", "set_theme(None",
    ];
    for (path, code) in all_production() {
        let text = strip_cfg_test(&code);
        for word in banned {
            assert!(!text.contains(word), "{path} mentions `{word}`: R-1748 / R-1749 -- ui_theme is an ordinary unknown key and the OS theme is not followed");
        }
    }
}

// =============================================================================================== §3.18.12: sizes

#[test]
fn s7_the_files_of_the_appearance_feature_stay_within_the_size_limits() {
    let limit = |path: &str| -> usize {
        match path {
            "src/appearance/presets.rs" => 600, // data only
            _ => 399,
        }
    };
    for (path, _) in production("appearance") {
        let n = read(&src(path.trim_start_matches("src/"))).lines().count();
        assert!(n <= limit(&path), "{path} has {n} lines (> {}): split it (SPEC-0200-0001 §7.1; `vars.rs` into derived colours and the table)", limit(&path));
    }
    for (f, max) in [("config/config_toml.rs", 250usize), ("config/startup_config.rs", 250), ("config/config_toml_lines.rs", 399), ("config_bridge/evaluate.rs", 80)] {
        let n = read(&src(f)).lines().count();
        assert!(n <= max, "{f} has {n} lines (> {max})");
    }
    assert!(read(&src("appearance/commands.rs")).lines().count() >= 20, "§7.2: no single-purpose file under 20 lines");
}
