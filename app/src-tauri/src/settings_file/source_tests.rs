//! TDD (unit-test-writer, 2026-10-20): `settings_file/source.rs` -- the embedded original and how the scaffold / sample are made of it
//! (SPEC-0300-0022 R-1611 / R-1620 / R-1630 / R-1631 / R-1631-1 / R-1633 / R-1634 / R-1635 / R-1636 / R-1637, AC-1634 / AC-1636, the
//! Rust side of AC-1632; SPEC-0200-0001 §3.17.3 `settings_file/source.rs`, §3.17.7).
//!
//! Contract the implementer must satisfy (module `settings_file::source`; declared in `settings_file/mod.rs` as
//! `#[cfg(test)] mod source_tests;`):
//!
//! ```ignore
//! pub const CONFIG_FILE: &str = "config.toml";
//! pub const SAMPLE_FILE: &str = "config.sample.toml";
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Kind { Template, Sample }
//! /// `include_str!("../../templates/config.sample.toml")` rendered. Pure.
//! pub fn render(kind: Kind, version: &str) -> String;
//! /// The same on an explicit original (the seam that makes the newline rules testable; `render` calls it with the embedded original).
//! pub fn render_from(original: &str, kind: Kind, version: &str) -> String;
//! ```
//! `render_from`: (1) a line starting with the OTHER kind's marker (`#@template ` / `#@sample `) is dropped, the own marker is replaced
//! by `## ` (so `#@sample abc` becomes `## abc` in the sample); (2) `@VERSION@` -> `version`; (3) every line break becomes `\r\n`,
//! whether the original has `\n` or `\r\n`, and the text ends with exactly one `\r\n`; (4) no BOM.
//!
//! The original is `app/src-tauri/templates/config.sample.toml`: written by code-generator, shaped by R-1631 / R-1631-1 / R-1633 /
//! R-1634 / R-1635 (comments only; `## ` description lines, `# ` setting lines; SPEC-0300-0023 R-1830: `[theme]` -> `[colors]` -> `[font]` -> `[layout]` -> `[input_keymap_custom]` -> `[[external_apps]]`).

use std::collections::BTreeSet;

use super::source::{render, render_from, Kind, CONFIG_FILE, SAMPLE_FILE};

const VERSION: &str = "9.8.7";

fn lines(text: &str) -> Vec<&str> {
    text.split("\r\n").collect()
}

fn index_of(all: &[&str], exact: &str) -> usize {
    all.iter().position(|l| *l == exact).unwrap_or_else(|| panic!("the line `{exact}` is missing from the original"))
}

/// `(action_id, key)` of every `# id = "key"` line between `# [input_keymap_custom]` and `# [[external_apps]]`.
fn keymap_lines(all: &[&str]) -> Vec<(String, String)> {
    let start = index_of(all, "# [input_keymap_custom]");
    let end = all.iter().position(|l| *l == "# [[external_apps]]").expect("the first `# [[external_apps]]`");
    all[start + 1..end]
        .iter()
        .filter_map(|l| {
            let rest = l.strip_prefix("# ")?;
            let (id, value) = rest.split_once(" = ")?;
            Some((id.to_string(), value.trim_matches('"').to_string()))
        })
        .collect()
}

#[test]
fn the_file_names_are_the_specified_ones() {
    assert_eq!(CONFIG_FILE, "config.toml");
    assert_eq!(SAMPLE_FILE, "config.sample.toml", "R-1620 / T-03");
}

// ------------------------------------------------------------------ the pure rendering (R-1611, R-1635, R-1637)

const ORIGINAL: &str = "## common head\n#@template only for the template\n#@sample only for the sample\n## guif @VERSION@\n\n# ui_theme = \"system\"\n";

#[test]
fn r1635_the_own_marker_becomes_a_description_line_and_the_other_kind_is_dropped() {
    assert_eq!(
        render_from(ORIGINAL, Kind::Template, "1.2.3"),
        "## common head\r\n## only for the template\r\n## guif 1.2.3\r\n\r\n# ui_theme = \"system\"\r\n"
    );
    assert_eq!(
        render_from(ORIGINAL, Kind::Sample, "1.2.3"),
        "## common head\r\n## only for the sample\r\n## guif 1.2.3\r\n\r\n# ui_theme = \"system\"\r\n"
    );
}

// R-1611: the original's newline (git autocrlf) does not matter; the output is CRLF, never a bare LF, never doubled.
#[test]
fn r1611_the_output_is_crlf_whatever_the_newline_of_the_original() {
    let from_lf = render_from(ORIGINAL, Kind::Template, VERSION);
    let from_crlf = render_from(&ORIGINAL.replace('\n', "\r\n"), Kind::Template, VERSION);
    assert_eq!(from_lf, from_crlf);
    assert!(!from_lf.contains("\r\r"));
    assert!(!from_lf.replace("\r\n", "").contains('\n'), "no bare LF");
    assert!(from_lf.ends_with("# ui_theme = \"system\"\r\n") && !from_lf.ends_with("\r\n\r\n"));
    // an original without a final newline still ends with exactly one CRLF
    assert!(render_from("## a\n# b = 1", Kind::Sample, VERSION).ends_with("# b = 1\r\n"));
}

#[test]
fn r1611_a_bom_in_the_original_is_not_carried_over() {
    let out = render_from(&format!("\u{feff}{ORIGINAL}"), Kind::Template, VERSION);
    assert!(!out.starts_with('\u{feff}'));
    assert!(out.starts_with("## common head"));
}

// ------------------------------------------------------------------ the real original, rendered (AC-1634, AC-1636)

fn both() -> (String, String) {
    (render(Kind::Template, VERSION), render(Kind::Sample, VERSION))
}

#[test]
fn r1611_the_real_scaffold_and_sample_are_utf8_crlf_without_bom_and_resolved() {
    for (what, text) in [("template", render(Kind::Template, VERSION)), ("sample", render(Kind::Sample, VERSION))] {
        assert!(!text.starts_with('\u{feff}'), "{what}: no BOM");
        assert!(text.ends_with("\r\n"), "{what}");
        assert!(!text.replace("\r\n", "").contains('\n'), "{what}: CRLF only");
        assert!(!text.contains("@VERSION@") && !text.contains("#@"), "{what}: every placeholder / marker is resolved");
        assert!(text.contains(&format!("guif {VERSION}")), "{what}: R-1635 the app version `guif <版>`");
    }
}

// AC-1634 / R-1635: the two differ only in the explanation at the top; the body from `# [theme]` on is the same (SPEC-0300-0023: the first setting is the theme table).
#[test]
fn ac1634_the_scaffold_and_the_sample_differ_only_in_the_leading_description() {
    let (t, s) = both();
    let (tl, sl) = (lines(&t), lines(&s));
    let first_setting = index_of(&tl, "# [theme]");
    let sample_ui = sl.iter().position(|l| *l == "# [theme]").unwrap();
    assert_eq!(tl[first_setting..], sl[sample_ui..], "everything from the first setting on is identical");
    assert_ne!(t, s);
    let (th, sh) = (tl[..first_setting].to_vec(), sl[..sample_ui].to_vec());
    let only_t: Vec<_> = th.iter().filter(|l| !sh.contains(l)).collect();
    let only_s: Vec<_> = sh.iter().filter(|l| !th.contains(l)).collect();
    assert!(!only_t.is_empty() && !only_s.is_empty() && only_t.len() <= 4 && only_s.len() <= 4, "a few description lines each: {only_t:?} / {only_s:?}");
}

// R-1635: the sentences of the two headers.
#[test]
fn r1635_the_scaffold_and_the_sample_say_what_they_are() {
    let (t, s) = both();
    assert!(t.contains("自由に編集できます") && t.contains("書き換えません"), "the scaffold: edit freely, the app never rewrites it");
    assert!(!t.contains("見本です"));
    assert!(s.contains("見本です") && s.contains("元に戻ります") && s.contains("config.toml に書いてください"), "the sample: rewritten at every start");
    assert!(!s.contains("自由に編集できます"));
    for text in [&t, &s] {
        assert!(text.contains("再起動"), "changes take effect at restart");
        assert!(text.contains("設定ファイルのチェック"), "the check can confirm mistakes");
        assert!(text.contains("設定の行"), "R-1631 3: `# ` lines are the setting lines");
    }
}

// AC-1636: only these shapes exist: an empty line, `##` / `## ...` descriptions, `# ...` setting lines.
#[test]
fn ac1636_every_line_is_blank_or_one_of_the_two_comment_shapes() {
    let (t, s) = both();
    for (what, text) in [("template", &t), ("sample", &s)] {
        for (i, line) in lines(text).iter().enumerate().filter(|(i, _)| *i + 1 < lines(text).len()) {
            let ok = line.is_empty() || *line == "##" || line.starts_with("## ") || (line.starts_with("# ") && !line.starts_with("# #"));
            assert!(ok, "{what} line {}: `{line}` is neither a description (`## `) nor a setting line (`# `)", i + 1);
        }
    }
}

// AC-1636 / R-1631-1 as amended by SPEC-0300-0023 R-1830: [theme] -> [colors] -> [font] -> [layout] -> [input_keymap_custom] -> [[external_apps]].
// There is NO `ui_theme` setting line any more (it is explained in a `## ` description only).
#[test]
fn ac1636_the_tables_come_in_the_fixed_order_and_there_is_no_ui_theme_setting_line() {
    let (t, _) = both();
    let all = lines(&t);
    let order = [
        index_of(&all, "# [theme]"),
        index_of(&all, "# [colors]"),
        index_of(&all, "# [font]"),
        index_of(&all, "# [layout]"),
        index_of(&all, "# [input_keymap_custom]"),
        index_of(&all, "# [[external_apps]]"),
    ];
    assert!(order.windows(2).all(|w| w[0] < w[1]), "R-1830: {order:?}");
    assert_eq!(all.iter().filter(|l| l.starts_with("# [")).count(), 4 + 1 + 4, "four appearance headings, one keymap heading and the four default registrations");
    assert!(!all.iter().any(|l| l.starts_with("# ") && !l.starts_with("## ") && l.contains("ui_theme")), "ui_theme is retired: no setting line (R-1830)");
    assert!(all.iter().any(|l| l.starts_with("## ") && l.contains("ui_theme")), "the retirement is explained");
}

#[test]
fn ac1636_uncommenting_the_theme_heading_and_preset_reads_as_a_theme_table_not_a_keymap_key() {
    let (t, _) = both();
    let body = t.replace("\r\n# [theme]\r\n", "\r\n[theme]\r\n").replace("\r\n# preset = \"nord\"\r\n", "\r\npreset = \"nord\"\r\n");
    assert_ne!(body, t, "the theme heading and the preset line were found");
    let value: toml::Value = body.parse().expect("valid TOML");
    assert_eq!(value.get("theme").and_then(|v| v.get("preset")).and_then(|v| v.as_str()), Some("nord"));
    assert!(value.get("preset").is_none(), "preset belongs to [theme]");
    assert!(value.get("input_keymap_custom").is_none(), "the keymap heading stays commented");
}

// R-1633 / T-07 / the Rust side of AC-1632: 32 operations (34 minus help_keymap / refresh), each with a `## ` description above it.
#[test]
fn r1633_the_keymap_section_has_the_32_operations_each_after_a_description() {
    let (t, _) = both();
    let all = lines(&t);
    let entries = keymap_lines(&all);
    let ids: BTreeSet<&str> = entries.iter().map(|(id, _)| id.as_str()).collect();
    assert_eq!(entries.len(), 32, "one line per operation: {entries:?}");
    assert_eq!(ids.len(), 32, "no duplicate operation");
    assert!(ids.contains("settings"), "`settings` is listed as 'open the settings file' (T-25 case A)");
    assert!(!ids.contains("help_keymap") && !ids.contains("refresh"), "operations without a function are not advertised");
    for (id, _) in &entries {
        let at = all.iter().position(|l| l.starts_with(&format!("# {id} = "))).unwrap();
        assert!(all[at - 1].starts_with("## "), "`{id}` needs its `## ` description on the line above");
    }
}

// R-1630 / R-1632 / R-1633 / R-1634: the facts a user needs are written (the vitest static test checks the same against the TS data).
#[test]
fn r1630_the_documented_values_rules_and_limits_are_in_the_text() {
    let (t, _) = both();
    for needle in [
        "preset", "default", "nord", "monokai", "catppuccin", "solarized", "light", "大文字小文字", "#RRGGBB", // [theme] / [colors] (SPEC-0300-0023 R-1830)
        "JetBrains Mono", "min_col_width", "tree_width_percent", "ui_theme",                          // [font] / [layout] / the retired ui_theme
        "空の文字列", "Comma", "Plus", "Space",             // keymap rules
        "Ctrl+Q", "Ctrl+,", "Shift+Enter", "Shift+Delete", "Shift+Tab", "F10", "Alt+F", "Alt+E", "Alt+V", "Alt+G", // fixed keys
        "name", "program", "args_for_file", "{path}", "{dir}", "{{", "}}", "20", "%", ".exe", // external_apps
        "書いたものだけ",
    ] {
        assert!(t.contains(needle), "the scaffold must mention `{needle}`");
    }
}

// R-1637: the four default registrations are written as commented TOML (their values are checked in config_bridge's consistency test).
#[test]
fn r1634_the_four_default_registrations_are_commented_tables() {
    let (t, _) = both();
    assert_eq!(lines(&t).iter().filter(|l| **l == "# [[external_apps]]").count(), 4);
    for name in ["ターミナルで開く", "VS Codeで開く", "エクスプローラーで開く", "GitHub Desktopで開く"] {
        assert!(t.contains(&format!("# name = \"{name}\"")), "{name}");
    }
}
