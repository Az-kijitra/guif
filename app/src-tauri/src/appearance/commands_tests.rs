//! TDD (unit-test-writer, 2026-10-24): `appearance/dto.rs` and `appearance/commands.rs` -- what the screen is given and who may ask for it
//! (SPEC-0300-0023 R-1720 / R-1721 / R-1820; AC-1722 (data); SPEC-0200-0001 §3.18.3 `dto.rs` / `commands.rs`, §3.18.4, §3.18.15 SHOULD-3).
//!
//! Contract (modules `appearance::dto` and `appearance::commands`; declared as `#[cfg(test)] mod commands_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct AppearanceDto {
//!     pub dark: bool, pub bg: String /* "#rrggbb" */, pub ui_vars: Vec<(&'static str, String)> /* = ui_vars(), same order; JSON [[name, value], ...] */,
//!     pub font_family: String /* css_font_family(..) */, pub font_size: u32, pub row_height: u32,
//!     pub min_col_width: u32, pub tree_width_percent: u32, pub problems: Vec<ProblemDto>,
//! }
//! /// Judgement and numbers only; NO Japanese sentence (SPEC-0300-0019 R-1201 2: the sentences W-B0..W-B9 are the screen's).
//! pub struct ProblemDto {
//!     pub kind: &'static str,            // presetUnusable | presetWrongType | colorsUnparsable | colorsNotTable | fontSize | fontFamily
//!                                        // | fontFamilyElements | notTable | layoutValue | unused
//!     pub line: Option<u32>, pub key: Option<String>, pub value: Option<String>,
//!     pub usable: Option<Vec<String>>,   // presetUnusable: the names that can be written
//!     pub default: Option<u32>, pub min: Option<u32>, pub max: Option<u32>,   // fontSize / layoutValue
//!     pub names: Option<Vec<String>>,    // fontFamilyElements: the names as written
//!     pub items: Option<Vec<ProblemItemDto>>,   // colorsUnparsable { name, line } / unused { table, name, line, used }
//! }
//! pub struct ProblemItemDto { pub table: Option<String>, pub name: String, pub line: Option<u32>, pub used: Option<String> }
//! pub fn appearance_dto(a: &Appearance) -> AppearanceDto;
//! // commands.rs: the pure core and the command (main window only; a copy of the start-up snapshot, the file is not read again)
//! pub fn appearance_for(window_label: &str, a: &Appearance) -> Result<AppearanceDto, String>;
//! #[tauri::command(async)] pub fn appearance_load(window: Window, state: State<'_, Appearance>) -> Result<AppearanceDto, String>;
//! ```

use super::commands::appearance_for;
use super::dto::{appearance_dto, ProblemDto};
use super::font::css_font_family;
use super::resolve::resolve;
use super::test_support::{colors_on, preset, wrong, PRESET_NAMES};
use super::vars::ui_vars;
use crate::shared::schema::appearance_raw::{RawAppearance, RawField, RawFamily, RawFont, RawLayout, RawSection};

fn only(raw: &RawAppearance, kind: &str) -> ProblemDto {
    let dto = appearance_dto(&resolve(raw));
    let found: Vec<ProblemDto> = dto.problems.into_iter().filter(|p| p.kind == kind).collect();
    assert_eq!(found.len(), 1, "exactly one `{kind}` problem expected");
    found.into_iter().next().unwrap()
}

// ------------------------------------------------------------------ the data of a start

#[test]
fn the_dto_carries_the_resolved_values_in_the_order_of_the_variables() {
    for name in PRESET_NAMES {
        let a = resolve(&preset(name));
        let dto = appearance_dto(&a);
        assert_eq!(dto.dark, a.dark, "{name}");
        assert_eq!(dto.bg, crate::appearance::color::hex(a.colors.get("bg").unwrap()), "{name}");
        let pairs: Vec<(&str, &str)> = dto.ui_vars.iter().map(|(n, v)| (*n, v.as_str())).collect();
        let expected = ui_vars(&a);
        assert_eq!(pairs, expected.iter().map(|(n, v)| (*n, v.as_str())).collect::<Vec<_>>(), "{name}");
        assert_eq!(dto.font_family, css_font_family(&a.font_families), "{name}");
        assert_eq!((dto.font_size, dto.row_height, dto.min_col_width, dto.tree_width_percent), (12, 16, 24, 24), "{name}");
        assert!(dto.problems.is_empty(), "{name}");
    }
}

#[test]
fn the_dto_follows_font_and_layout() {
    let raw = RawAppearance {
        font: RawSection::Table(RawFont { family: RawField::Value { value: RawFamily::Str("Consolas".into()), line: Some(2) }, size: RawField::Value { value: 20, line: Some(3) } }),
        layout: RawSection::Table(RawLayout { min_col_width: RawField::Value { value: 30, line: Some(5) }, tree_width_percent: RawField::Value { value: 40, line: Some(6) } }),
        ..preset("light")
    };
    let dto = appearance_dto(&resolve(&raw));
    assert!(!dto.dark);
    assert_eq!((dto.font_size, dto.row_height, dto.min_col_width, dto.tree_width_percent), (20, 26, 30, 40));
    assert!(dto.font_family.starts_with("\"Consolas\", \"JetBrains Mono\""), "{}", dto.font_family);
}

// ------------------------------------------------------------------ SHOULD-3: the fields of each problem

#[test]
fn should3_preset_unusable_has_line_value_and_the_names_that_can_be_written() {
    let p = only(&preset("dracula"), "presetUnusable");
    assert_eq!((p.line, p.value.as_deref()), (Some(2), Some("dracula")));
    assert_eq!(p.usable.as_deref(), Some(&["default", "nord", "monokai", "catppuccin", "solarized", "light"].map(String::from)[..]), "W-B0 shows `使える値: default、nord、…` without the screen knowing the list");
}

#[test]
fn should3_preset_wrong_type_names_the_key() {
    let raw = RawAppearance { theme: crate::shared::schema::appearance_raw::RawThemeSection::WrongType { line: Some(4) }, ..RawAppearance::default() };
    let p = only(&raw, "presetWrongType");
    assert_eq!((p.line, p.key.as_deref()), (Some(4), Some("theme")));
}

#[test]
fn should3_colors_unparsable_has_items_with_name_and_line() {
    let raw = colors_on(preset("nord"), &[("folder", "x"), ("file", "y")]);
    let p = only(&raw, "colorsUnparsable");
    let items = p.items.expect("items");
    assert_eq!(items.iter().map(|i| (i.name.as_str(), i.line)).collect::<Vec<_>>(), [("folder", Some(2)), ("file", Some(3))]);
}

#[test]
fn should3_colors_not_table_font_family_and_not_table_carry_their_lines_and_keys() {
    let raw = RawAppearance { colors: RawSection::NotTable { line: Some(4) }, ..RawAppearance::default() };
    assert_eq!(only(&raw, "colorsNotTable").line, Some(4));
    let raw = RawAppearance { font: RawSection::NotTable { line: Some(6) }, layout: RawSection::NotTable { line: Some(8) }, ..RawAppearance::default() };
    let dto = appearance_dto(&resolve(&raw));
    let mut got: Vec<(Option<u32>, Option<String>)> = dto.problems.iter().filter(|p| p.kind == "notTable").map(|p| (p.line, p.key.clone())).collect();
    got.sort();
    assert_eq!(got, [(Some(6), Some("font".to_string())), (Some(8), Some("layout".to_string()))]);
    let raw = RawAppearance { font: RawSection::Table(RawFont { family: RawField::WrongType { line: Some(3) }, size: RawField::Missing }), ..RawAppearance::default() };
    assert_eq!(only(&raw, "fontFamily").line, Some(3));
}

#[test]
fn should3_font_size_and_layout_value_carry_the_default_and_the_range_so_the_screen_has_no_copy() {
    let raw = RawAppearance { font: RawSection::Table(RawFont { family: RawField::Missing, size: RawField::Value { value: 30, line: Some(4) } }), ..RawAppearance::default() };
    let p = only(&raw, "fontSize");
    assert_eq!((p.line, p.key.as_deref(), p.default, p.min, p.max), (Some(4), Some("size"), Some(12), Some(10), Some(24)));
    let raw = RawAppearance { layout: RawSection::Table(RawLayout { min_col_width: wrong(2), tree_width_percent: RawField::Value { value: 9, line: Some(3) } }), ..RawAppearance::default() };
    let dto = appearance_dto(&resolve(&raw));
    type Row = (Option<String>, Option<u32>, Option<u32>, Option<u32>, Option<u32>);
    let mut got: Vec<Row> =
        dto.problems.iter().filter(|p| p.kind == "layoutValue").map(|p| (p.key.clone(), p.line, p.default, p.min, p.max)).collect();
    got.sort();
    assert_eq!(
        got,
        [
            (Some("min_col_width".to_string()), Some(2), Some(24), Some(10), Some(80)),
            (Some("tree_width_percent".to_string()), Some(3), Some(24), Some(10), Some(50)),
        ]
    );
}

#[test]
fn should3_font_family_elements_carry_the_names_as_written() {
    let raw = RawAppearance {
        font: RawSection::Table(RawFont { family: RawField::Value { value: RawFamily::List(vec!["Good".into(), "Bad\u{1}".into()]), line: Some(4) }, size: RawField::Missing }),
        ..RawAppearance::default()
    };
    let p = only(&raw, "fontFamilyElements");
    assert_eq!((p.line, p.names), (Some(4), Some(vec!["Bad\u{1}".to_string()])), "the control character is replaced by `?` in the screen's sentence, not here");
}

#[test]
fn should3_unused_items_carry_table_name_line_and_the_name_that_was_used() {
    let raw = colors_on(crate::appearance::test_support::theme_table(Some("nord"), Some("light"), None), &[("bg", "#111111"), ("background", "#222222")]);
    let p = only(&raw, "unused");
    let items = p.items.expect("items");
    let got: Vec<(String, String, Option<u32>, String)> = items.into_iter().map(|i| (i.table.unwrap(), i.name, i.line, i.used.unwrap())).collect();
    assert_eq!(
        got,
        [
            ("theme".to_string(), "name".to_string(), Some(3), "preset".to_string()),
            ("colors".to_string(), "background".to_string(), Some(3), "bg".to_string()),
        ]
    );
}

#[test]
fn no_problem_contains_a_japanese_sentence() {
    let raw = colors_on(preset("dracula"), &[("folder", "x")]);
    for p in appearance_dto(&resolve(&raw)).problems {
        let texts: Vec<String> = [p.value.clone(), p.key.clone()].into_iter().flatten().chain(p.usable.clone().unwrap_or_default()).collect();
        assert!(texts.iter().all(|t| t.is_ascii()), "{texts:?}: the DTO holds values, never sentences (R-1201 2)");
        assert!(p.kind.is_ascii());
    }
}

// ------------------------------------------------------------------ the wire form

#[test]
fn the_dto_fields_are_camel_case_on_the_wire() {
    let mut dto = appearance_dto(&resolve(&preset("nord")));
    dto.ui_vars.clear();
    dto.problems.clear();
    let text = toml::to_string(&dto).expect("serialize");
    for key in ["dark", "bg", "uiVars", "fontFamily", "fontSize", "rowHeight", "minColWidth", "treeWidthPercent", "problems"] {
        assert!(text.contains(&format!("{key} =")), "`{key}` missing: {text}");
    }
    for snake in ["ui_vars", "font_family", "font_size", "row_height", "min_col_width", "tree_width_percent"] {
        assert!(!text.contains(snake), "{snake} must be camelCase: {text}");
    }
    let json = toml::to_string(&appearance_dto(&resolve(&preset("nord")))).expect("serialize");
    assert!(json.contains("[\"--ui-bg\", \"#2e3440\"]"), "ui_vars are [name, value] arrays: {json}");
    let layout = only(&RawAppearance { layout: RawSection::Table(RawLayout { min_col_width: wrong(1), tree_width_percent: RawField::Missing }), ..RawAppearance::default() }, "layoutValue");
    let text = toml::to_string(&layout).unwrap();
    assert!(text.contains("kind = \"layoutValue\"") && text.contains("key = \"min_col_width\""), "{text}");
}

// ------------------------------------------------------------------ appearance_load: main window only

#[test]
fn r1555_style_only_the_main_window_may_ask() {
    let a = resolve(&preset("nord"));
    assert_eq!(appearance_for("main", &a), Ok(appearance_dto(&a)));
    for label in ["viewer", "", "Main", "main ", "main2", "other"] {
        assert!(appearance_for(label, &a).is_err(), "{label:?}: the viewer gets its colours from the initialization script, not from this command");
    }
}

#[test]
fn the_command_returns_a_copy_of_the_snapshot_and_reads_no_file() {
    // appearance_for takes the already-resolved value only: there is no path, no file, no environment in its signature
    let a = resolve(&preset("light"));
    let first = appearance_for("main", &a).unwrap();
    assert_eq!(appearance_for("main", &a).unwrap(), first, "a page reload gets the same value");
}
