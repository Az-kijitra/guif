//! TDD (unit-test-writer, 2026-10-24): crate-wide WIRING tests of the appearance feature -- `lib.rs`, `shared/window_theme.rs`,
//! `shared/window_paint.rs`, the viewer window, `config_bridge/` (SPEC-0300-0023 R-1741 / R-1742 / R-1749; AC-1741 / AC-1742 / AC-1743 (Rust
//! half); SPEC-0300-0022 R-1651 / R-1652; SPEC-0200-0001 §3.18.5, §3.18.4, §3.18.10 (`archive/boundary_tests.rs`, `viewer/boundary_tests.rs`
//! rows), §3.18.15 MINOR-4). Source-text scans like `appearance_structure_tests.rs`; RED (a failing assertion) until the code exists. The three-place
//! registration of `appearance_load` (generate_handler!, build.rs, capabilities) is in `acl_consistency_bridge_tests.rs`.
//!
//! In one sentence: after `config_bridge::snapshot` returns `(startup, registry, appearance)`, `lib.rs` calls `set_theme(Some(theme_for(
//! appearance.dark)))` unconditionally, `.manage`s the three values and the `WindowPaint`; the main window's background and the viewer's
//! background AND initialization script come from that `WindowPaint`; nothing listens for an OS theme change.

use crate::external_apps_structure_tests::{call_args, code_only, crate_uses, fn_params, read, src};
use crate::settings_file_structure_tests::{count, file};

fn lib() -> String {
    file("lib.rs")
}

/// Brace depth of `text[..upto]` (strings and comments are already scrubbed).
fn depth(text: &str, upto: usize) -> i32 {
    text[..upto].chars().fold(0, |d, c| match c {
        '{' => d + 1,
        '}' => d - 1,
        _ => d,
    })
}

// =============================================================================================== lib.rs

#[test]
fn r1741_lib_rs_takes_the_snapshot_as_a_triple_and_sets_the_theme_from_the_resolved_brightness_unconditionally() {
    let lib = code_only(&lib());
    let snap = lib.find("config_bridge::snapshot(").expect("config_bridge::snapshot(..)");
    let head = &lib[lib[..snap].rfind("let ").expect("a let before the snapshot call")..snap];
    assert_eq!(head.matches(',').count(), 2, "(startup, registry, appearance) -- a triple: `{head}`");
    let theme = lib.find("set_theme(").expect("set_theme(");
    let build = lib.find(".build(tauri::generate_context!())").expect("build()");
    let run = lib.rfind(".run(").expect("run()");
    assert!(build < snap && snap < theme && theme < run, "order: build() -> config_bridge::snapshot -> set_theme -> run (R-1741: the title bar is created in run())");
    let call = &lib[theme..(theme + 120).min(lib.len())];
    assert!(call.starts_with("set_theme(Some(") && call.contains("theme_for(") && call.contains(".dark"), "set_theme(Some(window_theme::theme_for(appearance.dark))): `{call}`");
    let run_fn = lib.find("pub fn run()").expect("pub fn run()");
    assert_eq!(depth(&lib[run_fn..], theme - run_fn), depth(&lib[run_fn..], snap - run_fn), "set_theme is not inside an `if` / `match`: it is ALWAYS called (R-1741; the old `if let Some(theme) = requested_theme(..)` is gone)");
    assert_eq!(count(&lib, "set_theme("), 1);
    assert!(!lib.replace(' ', "").contains("set_theme(None"));
}

#[test]
fn r1651_lib_rs_manages_the_three_values_and_the_window_paint_between_snapshot_and_run() {
    let lib = code_only(&lib());
    let snap = lib.find("config_bridge::snapshot(").unwrap();
    let run = lib.rfind(".run(").unwrap();
    let tail = &lib[snap..run];
    assert!(tail.matches("app.manage(").count() >= 4, "StartupConfig, Registry, Appearance and WindowPaint are `.manage`d after the one start-up read: {tail}");
    assert!(tail.contains("appearance::paint::window_paint("), "WindowPaint = appearance::paint::window_paint(&appearance), made once at start-up");
    let mut rest = &lib[..snap];
    while let Some(at) = rest.find(".manage(") {
        let args = call_args(&rest[at..], ".manage(").unwrap_or_default();
        assert!(!args.contains("ppearance") && !args.contains("aint"), "they cannot be managed before the snapshot exists: `{args}`");
        rest = &rest[at + ".manage(".len()..];
    }
}

#[test]
fn r1742_the_main_window_background_is_the_resolved_bg_and_is_set_before_show() {
    let lib = code_only(&lib());
    let setup = lib.find(".setup(|app|").expect(".setup");
    let bg = setup + lib[setup..].find("apply_background(").expect("apply_background(..) in .setup");
    let args = call_args(&lib[bg..], "apply_background(").expect("args");
    assert!(args.contains("&main") && args.contains(".bg"), "apply_background(&main, paint.bg): `{args}`");
    assert!(lib[..bg].rfind("WindowPaint").is_some_and(|w| w > setup), "the WindowPaint comes from the managed state inside .setup (it was managed before run())");
    let show = lib.find("main.show()").expect("main.show()");
    assert!(bg < show);
    assert_eq!(count(&lib, "WindowKind"), 0);
}

#[test]
fn r1749_lib_rs_listens_for_no_theme_change() {
    let lib = code_only(&lib());
    assert!(!lib.contains("ThemeChanged") && !lib.contains("requested_theme") && !lib.contains("WindowKind"));
}

#[test]
fn the_command_is_in_the_handler_under_its_module_path() {
    let lib = code_only(&lib());
    assert_eq!(count(&lib, "appearance::commands::appearance_load"), 1, "generate_handler! lists appearance::commands::appearance_load once (the 35th command)");
}

#[test]
fn tauri_conf_json_does_not_pin_a_window_theme() {
    let conf = read(&src("../tauri.conf.json"));
    assert!(!conf.contains("\"theme\""), "the main window's theme is set by set_theme(Some(..)) from the resolved bg, not by tauri.conf.json (R-1741)");
}

// =============================================================================================== shared/window_theme.rs

#[test]
fn r1742_window_theme_is_a_thin_mapping_plus_one_side_effect_with_the_colour_given() {
    let theme = file("shared/window_theme.rs");
    let c = code_only(&theme);
    assert!(c.contains("pub fn theme_for(dark: bool)"), "theme_for(dark: bool) -> Theme");
    assert!(c.contains("Theme::Dark") && c.contains("Theme::Light"));
    let params = fn_params(&c, "apply_background").expect("pub fn apply_background");
    assert_eq!(params.len(), 2, "apply_background(window, rgb): {params:?}");
    assert!(params[0].1.contains("WebviewWindow") && params[1].1.replace(' ', "") == "(u8,u8,u8)", "{params:?}");
    assert_eq!(count(&theme, "set_background_color("), 1);
    assert!(crate_uses(&c).is_empty(), "window_theme.rs names no feature and no schema type: {:?}", crate_uses(&c));
    for gone in ["WindowKind", "requested_theme", "background_rgb", "ThemeSetting", "fn window_kind"] {
        assert!(!c.contains(gone), "`{gone}` is gone");
    }
    let n = read(&src("shared/window_theme.rs")).lines().count();
    assert!(n <= 60, "SHOULD-181: shared/window_theme.rs stays thin ({n} lines)");
}

// =============================================================================================== the viewer window

#[test]
fn r1742_the_viewer_gets_its_colours_through_one_initialization_script_and_its_background_from_the_same_paint() {
    let window = file("viewer/window.rs");
    let c = code_only(&window);
    assert_eq!(count(&window, ".initialization_script("), 1, "ONE call (§3.18.10: viewer rows)");
    let new = c.find("WebviewWindowBuilder::new(").expect("WebviewWindowBuilder::new(");
    let init = c.find(".initialization_script(").unwrap();
    let build = c.find(".build()").expect(".build()");
    assert!(new < init && init < build, "the script is added to the builder before .build()");
    let args = call_args(&c[init..], ".initialization_script(").unwrap();
    assert!(args.contains("viewer_init_script"), "the script text is WindowPaint::viewer_init_script: `{args}`");
    assert!(c.contains("WindowPaint") && c.contains("try_state"), "the paint is read with try_state (no paint -> no script, no panic)");
    let bg = c.find("apply_background(").expect("apply_background(");
    let bg_args = call_args(&c[bg..], "apply_background(").unwrap();
    assert!(bg_args.contains("&window") && bg_args.contains(".bg"), "apply_background(&window, paint.bg): `{bg_args}`");
    assert!(build < bg && c[bg..].find("window.show()").is_some(), "background before show, after build (R-919-1)");
    assert!(!c.contains("ThemeChanged") && !c.contains("WindowKind"));
}

#[test]
fn r1741_the_viewer_capability_is_untouched_by_the_appearance() {
    let viewer = read(&src("../capabilities/viewer.json"));
    assert!(!viewer.contains("appearance"), "viewer.json gains nothing: the viewer reads its colours from the initialization script, not from a command");
}

// =============================================================================================== config_bridge

#[test]
fn r1651_evaluate_returns_the_triple_from_both_entrances_and_check_carries_the_appearance_dto() {
    let evaluate = code_only(&file("config_bridge/evaluate.rs"));
    assert_eq!(evaluate.matches("-> (StartupConfig, Registry, Appearance)").count(), 2, "snapshot and snapshot_at");
    assert!(evaluate.contains("Appearance"));
    let check = code_only(&file("config_bridge/check.rs"));
    assert!(check.contains("pub appearance: AppearanceDto"), "ConfigCheckDto {{ keymap, external_apps, appearance }}");
    assert!(check.contains("appearance_dto("), "the check returns the DTO that appearance_load serves");
    assert!(!check.contains("window_paint") && !check.contains("WindowPaint") && !check.contains("set_theme") && !check.contains("apply_background"), "R-1652: the check paints and reflects nothing");
}

#[test]
fn r1748_startup_config_holds_only_the_loaded_snapshot() {
    let startup = code_only(&file("config/startup_config.rs"));
    assert!(startup.contains("pub loaded: ConfigTomlLoadResult"));
    assert!(!startup.contains("pub theme") && !startup.contains("ui_theme") && !startup.contains("ThemeResolution"));
}
