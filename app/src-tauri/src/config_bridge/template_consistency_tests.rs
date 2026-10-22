//! TDD (unit-test-writer, 2026-10-20): the original `templates/config.sample.toml` against the defaults that live in code
//! (SPEC-0300-0022 R-1612 / R-1634 / R-1637 / R-1638 1 and 5, AC-1630 (Rust side) / AC-1631 / AC-1632 (4) / AC-1634; T-09;
//! SPEC-0200-0001 §3.17.7 "照合のテストの置き場所"). It sits in `config_bridge/` because it looks at `settings_file`, `config` and
//! `external_apps` together (`#[cfg(test)]`: the dependency rules apply to production code only).
//!
//! Method (R-1638 1): take the rendered scaffold / sample, strip the leading `# ` of every setting line (NOT of `## ` description lines),
//! write it as `config.toml` and run the start-up reading and validation on it. The TypeScript side of the same check (the keymap
//! through `validateKeymapEntries`, `ACTION_IDS`, `RESERVED_FIXED_KEYS`, manual §7.2) is vitest's job; here the keymap is compared to
//! `DEFAULT_KEYMAP` by reading that data file as text (it is plain `name: "Key",` lines).

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use crate::config::config_toml::{load, ConfigTomlLoadResult};
use crate::config::startup_config::StartupConfig;
use crate::external_apps::defaults::DEFAULT_APPS;
use crate::external_apps::registry::Registry;
use crate::settings_file::editor::{vscode_candidate, VSCODE_RELATIVE};
use crate::settings_file::source::{render, Kind};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawValue};
use crate::shared::schema::ui_theme::{ThemeSetting, UiThemeRaw};

const DEFAULT_NAMES: [&str; 4] = ["ターミナルで開く", "VS Codeで開く", "エクスプローラーで開く", "GitHub Desktopで開く"];

fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn read_text(rel_from_manifest: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel_from_manifest);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// R-1631 2: remove `# ` from the setting lines only (a `## ` description line does not start with `# `).
fn uncomment_settings(text: &str) -> String {
    text.split("\r\n").map(|l| l.strip_prefix("# ").unwrap_or(l)).collect::<Vec<_>>().join("\r\n")
}

fn load_text(text: &str) -> (tempfile::TempDir, ConfigTomlLoadResult) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, text).unwrap();
    let loaded = load(&path);
    (dir, loaded)
}

/// `DEFAULT_KEYMAP` of `keymap-defaults.ts`: every `  id: "Key",` line of that object.
fn default_keymap() -> BTreeMap<String, String> {
    let ts = read_text("../src/lib/features/keyboard/keymap-defaults.ts");
    let body = ts.split("export const DEFAULT_KEYMAP").nth(1).expect("DEFAULT_KEYMAP in keymap-defaults.ts");
    let body = body.split("};").next().unwrap();
    let mut map = BTreeMap::new();
    for line in body.lines() {
        let t = line.trim();
        if let Some((id, rest)) = t.split_once(": \"") {
            if id.chars().all(|c| c.is_ascii_lowercase() || c == '_') && !id.is_empty() {
                map.insert(id.to_string(), rest.trim_end_matches(',').trim_end_matches('"').to_string());
            }
        }
    }
    map
}

// ------------------------------------------------------------------ AC-1630: un-commenting the settings gives exactly the defaults

#[test]
fn ac1630_the_uncommented_scaffold_and_sample_are_valid_and_complete() {
    for (what, kind) in [("scaffold", Kind::Template), ("sample", Kind::Sample)] {
        let (_d, r) = load_text(&uncomment_settings(&render(kind, version())));
        assert!(r.present, "{what}");
        assert!(r.keymap.parse_error.is_none(), "{what}: valid TOML");
        assert!(r.unknown.is_empty(), "{what}: no unknown setting (R-1638 1): {:?}", r.unknown);
        assert_eq!(r.ui_theme, UiThemeRaw::Str("system".into()), "{what}: R-1632 the documented default");
        assert_eq!(StartupConfig::from_loaded(r).theme.setting, ThemeSetting::System);
    }
}

// R-1638 1 / AC-1630: the keymap = DEFAULT_KEYMAP for the 32 documented operations, nothing else.
#[test]
fn ac1630_the_uncommented_keymap_equals_default_keymap_for_the_32_operations() {
    let defaults = default_keymap();
    assert_eq!(defaults.len(), 34, "sanity: the scrape of keymap-defaults.ts saw the 34 default bindings");
    for kind in [Kind::Template, Kind::Sample] {
        let (_d, r) = load_text(&uncomment_settings(&render(kind, version())));
        let got: BTreeMap<String, String> = r.keymap.entries.iter().map(|e| (e.action_id.clone(), e.value.clone().expect("a string value"))).collect();
        let mut expected = defaults.clone();
        expected.remove("help_keymap");
        expected.remove("refresh");
        assert_eq!(got, expected, "{kind:?}");
        assert_eq!(got.len(), 32);
    }
}

// R-1638 1 / R-1634 / AC-1630: the four default registrations, field by field, with the W-90..W-93 names.
#[test]
fn ac1630_the_uncommented_external_apps_equal_default_apps() {
    for kind in [Kind::Template, Kind::Sample] {
        let (_d, r) = load_text(&uncomment_settings(&render(kind, version())));
        let ExternalAppsRaw::Array(apps) = &r.external_apps else { panic!("{kind:?}: external_apps must be an array of four tables") };
        assert_eq!(apps.len(), 4);
        for (i, (raw, d)) in apps.iter().zip(DEFAULT_APPS.iter()).enumerate() {
            let strings = |v: &[&str]| RawValue::Value(v.iter().map(|s| s.to_string()).collect::<Vec<_>>());
            assert_eq!(raw.name, RawValue::Value(DEFAULT_NAMES[i].to_string()), "{kind:?} #{}", i + 1);
            assert_eq!(raw.program, RawValue::Value(d.program.to_string()), "{kind:?} #{} program (unexpanded)", i + 1);
            assert_eq!(raw.args, strings(d.args), "{kind:?} #{} args", i + 1);
            assert_eq!(raw.args_for_file, d.args_for_file.map_or(RawValue::Missing, strings), "{kind:?} #{} args_for_file", i + 1);
            assert_eq!(raw.key, RawValue::Value(d.key.to_string()), "{kind:?} #{} key", i + 1);
        }
    }
}

// The same through the registry (start-up validation): all four are usable, none is reported.
#[test]
fn ac1630_the_uncommented_registrations_pass_the_startup_validation() {
    let (_d, r) = load_text(&uncomment_settings(&render(Kind::Template, version())));
    let env = |n: &str| (n.eq_ignore_ascii_case("LOCALAPPDATA") || n.eq_ignore_ascii_case("SystemRoot")).then(|| OsString::from(r"C:\E"));
    let registry = Registry::from_raw(&r.external_apps, &r.lines.external_apps, &env, None);
    assert_eq!(registry.apps.len(), 4);
    assert!(registry.invalid.is_empty() && !registry.type_error);
    assert!(registry.apps.iter().all(|a| a.key.is_some() && !a.key_invalid && a.key_line.is_some()), "written keys carry their lines");
}

// ------------------------------------------------------------------ AC-1631 / R-1612: as written (all comments) = no config.toml

#[test]
fn ac1631_the_scaffold_and_the_sample_read_as_if_there_were_no_settings() {
    for kind in [Kind::Template, Kind::Sample] {
        let (_d, r) = load_text(&render(kind, version()));
        assert!(r.present && r.keymap.parse_error.is_none());
        assert!(r.keymap.entries.is_empty(), "no keymap override (not a single operation overridden)");
        assert_eq!(r.ui_theme, UiThemeRaw::Missing, "the theme follows the OS");
        assert_eq!(r.external_apps, ExternalAppsRaw::Missing, "the default four are used");
        assert!(r.unknown.is_empty(), "AC-1631: zero unknown settings");
        let env = |_: &str| None::<OsString>;
        let registry = Registry::from_raw(&r.external_apps, &r.lines.external_apps, &env, None);
        assert_eq!(registry.apps.len(), 4);
        assert!(registry.invalid.is_empty());
    }
}

// ------------------------------------------------------------------ the VS Code place agrees with the default (T-11, §3.17.3)

#[test]
fn t11_the_vs_code_candidate_is_the_place_of_the_default_registration() {
    assert_eq!(DEFAULT_APPS[1].program, format!("%LOCALAPPDATA%\\{VSCODE_RELATIVE}"), "defaults.rs's VS Code and editor.rs must not drift apart");
    let env = |n: &str| n.eq_ignore_ascii_case("LOCALAPPDATA").then(|| OsString::from(r"C:\Users\u\AppData\Local"));
    let registry = Registry::from_raw(&ExternalAppsRaw::Missing, &Default::default(), &env, None);
    let expanded = PathBuf::from(&registry.apps[1].program);
    assert_eq!(vscode_candidate(Some(std::ffi::OsStr::new(r"C:\Users\u\AppData\Local"))), Some(expanded));
}

// ------------------------------------------------------------------ the version (R-1638 4, Rust side)

#[test]
fn r1638_4_the_rendered_version_is_the_crate_version() {
    for kind in [Kind::Template, Kind::Sample] {
        let text = render(kind, version());
        assert!(text.contains(&format!("guif {}", version())), "{kind:?}: `guif <版>` with the version of Cargo.toml");
    }
    // the three version sources agree (the vitest static test checks the same three files; this keeps the Rust build honest)
    let tauri_conf = read_text("tauri.conf.json");
    assert!(tauri_conf.contains(&format!("\"version\": \"{}\"", version())), "tauri.conf.json version != Cargo.toml version {}", version());
}

// AC-1635 (behavioural half): the text is a function of the original and the version only (same input, same bytes; no clock, no env).
#[test]
fn ac1635_rendering_is_deterministic() {
    assert_eq!(render(Kind::Template, "1.0.0"), render(Kind::Template, "1.0.0"));
    assert_ne!(render(Kind::Template, "1.0.0"), render(Kind::Template, "2.0.0"));
}
