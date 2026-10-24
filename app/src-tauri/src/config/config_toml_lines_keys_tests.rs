//! TDD (unit-test-writer, 2026-10-20; migrated 2026-10-24 for SPEC-0300-0023 -- this file REPLACES `config_toml_lines_tests.rs`: the marker key
//! `theme` is now `theme` (a known top-level key whose line is `lines.top["theme"]`); nothing else changed): `config/config_toml_lines.rs` -- the 1-based line of every key that
//! `config.toml` reading needs to report (SPEC-0300-0022 R-1642; SPEC-0200-0001 §3.17.3 / §3.17.5 "S-L の結果").
//!
//! Specs: SPEC-0300-0022 R-1642 (the line of the key; of the `[[external_apps]]` header when no field can be named; the type-error
//! lines), R-1641 (a syntax error has a line but no setting), AC-1640 / AC-1642 (the lines in the notices), ISS-0234 (b) / spike S-L
//! (variant V5: keys as `Sp<String>`, table values as plain `Node`, array elements as `Sp<Node>`). The inputs below are the
//! spike's: dotted keys, implicit tables, inline tables, datetimes, BOM, CRLF, wrong types, unknown keys, multi-line strings and
//! arrays. The spike found NO item that cannot be located, so every expectation is an exact line (no "None is acceptable").
//!
//! Contract the implementer must satisfy:
//!
//! ```ignore
//! // shared/schema/config_lines.rs  (pure data, no logic, no imports other than std)
//! #[derive(Debug, Clone, PartialEq, Eq, Default)]
//! pub struct ConfigLines {
//!     pub top: BTreeMap<String, u32>,                    // SPEC-0300-0023: the line of each top-level key (`theme` is gone)
//!     pub tables: BTreeMap<String, BTreeMap<String, u32>>, // theme / colors / font / layout: the line of each key inside
//!     pub input_keymap_custom: Option<u32>,              // the key, or the first dotted key / the `[input_keymap_custom]` header
//!     pub keymap_entries: BTreeMap<String, u32>,         // action id -> the line of that key (every key, any value type)
//!     pub external_apps: ExternalAppsLines,
//! }
//! #[derive(Debug, Clone, PartialEq, Eq, Default)]
//! pub struct ExternalAppsLines { pub line: Option<u32> /* key, or the FIRST header */, pub apps: Vec<AppLines> }
//! #[derive(Debug, Clone, PartialEq, Eq, Default)]
//! pub struct AppLines { pub header: Option<u32>, pub name: Option<u32>, pub program: Option<u32>, pub args: Option<u32>,
//!                       pub args_for_file: Option<u32>, pub key: Option<u32> }
//! #[derive(Debug, Clone, PartialEq, Eq)]
//! pub enum UnknownSetting { Top { name: String, line: Option<u32> }, AppField { position: usize /* 1-based */, name: String, line: Option<u32> } }
//!
//! // config/config_toml_lines.rs
//! pub fn index(text: &str) -> Option<ConfigLines>;   // None only when the WHOLE text cannot be parsed (a syntax error)
//! pub fn line_of(text: &str, offset: usize) -> u32;  // 1 + the number of '\n' in text.as_bytes()[..min(offset, len)]
//! ```
//!
//! `index` does not read a file and never panics. It accepts the text with or without a leading BOM (the spike showed the line
//! does not move either way; `load` strips the BOM before calling it). The lines of UNKNOWN keys are not in `ConfigLines`: they
//! reach `load` through its own tests (`config_toml_load_lines_tests.rs`, see the open question about how `load` gets them).

use std::collections::BTreeMap;

use super::config_toml_lines::{index, line_of};
use crate::shared::schema::config_lines::{AppLines, ConfigLines};

const STD: &str = "theme = \"nord\"\n[input_keymap_custom]\ncopy = \"Ctrl+C\"\npaste = \"Ctrl+V\"\n\n[[external_apps]]\nname = \"a\"\nprogram = \"p\"\nargs = [\"{path}\"]\n\n[[external_apps]]\nname = \"b\"\nkey = \"Ctrl+1\"\n";

fn idx(text: &str) -> ConfigLines {
    index(text).unwrap_or_else(|| panic!("index must locate the keys of a valid TOML text (R-1642) but returned None for {text:?}"))
}

fn entries(items: &[(&str, u32)]) -> BTreeMap<String, u32> {
    items.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

fn app(header: u32, name: Option<u32>, program: Option<u32>, args: Option<u32>, key: Option<u32>) -> AppLines {
    AppLines { header: Some(header), name, program, args, args_for_file: None, key }
}

fn crlf(text: &str) -> String {
    text.replace('\n', "\r\n")
}

// ------------------------------------------------------------------ the ordinary layout (spike case 1)

// R-1642: the line of each key; a standard table's key is on its header's line; each `[[external_apps]]` element has its header.
#[test]
fn r1642_standard_tables_and_array_of_tables_get_the_line_of_each_key() {
    let lines = idx(STD);
    assert_eq!(lines.top.get("theme").copied(), Some(1));
    assert_eq!(lines.input_keymap_custom, Some(2), "the key of a standard table is the line of its header");
    assert_eq!(lines.keymap_entries, entries(&[("copy", 3), ("paste", 4)]));
    assert_eq!(lines.external_apps.line, Some(6), "R-1642: external_apps = the key, or the FIRST header");
    assert_eq!(
        lines.external_apps.apps,
        vec![app(6, Some(7), Some(8), Some(9), None), app(11, Some(12), None, None, Some(13))],
        "each element: its header line and the line of each field it has (R-1642: the line of the registration's `key`)"
    );
}

// R-1642: a field that is not written has no line (None), an `args_for_file` has its own line.
#[test]
fn r1642_args_for_file_has_its_own_line_and_missing_fields_have_none() {
    let text = "[[external_apps]]\nname = \"a\"\nprogram = \"p.exe\"\nargs_for_file = [\"/select,\", \"{path}\"]\n";
    let lines = idx(text);
    assert_eq!(
        lines.external_apps.apps,
        vec![AppLines { header: Some(1), name: Some(2), program: Some(3), args: None, args_for_file: Some(4), key: None }]
    );
}

#[test]
fn a_text_with_none_of_the_known_keys_has_no_lines_at_all() {
    // SPEC-0300-0023: `top` lists every top-level key, so only the KNOWN-key fields stay empty
    let lines = idx("# only a comment\nsome_future_setting = 1\n");
    assert_eq!(lines, ConfigLines { top: entries(&[("some_future_setting", 2)]), ..ConfigLines::default() });
    assert_eq!(idx(""), ConfigLines::default());
}

// ------------------------------------------------------------------ dotted keys, implicit tables, inline tables (spike 2a-2e)

// Spike 2a: `input_keymap_custom.copy = ...` -- the table itself is never written as `[...]`; its line is the first key's line.
#[test]
fn spike_2a_dotted_keys_give_the_first_dotted_line_for_the_table_and_each_key_its_own() {
    let lines = idx("theme = \"nord\"\ninput_keymap_custom.copy = \"x\"\ninput_keymap_custom.paste = \"y\"\n");
    assert_eq!(lines.top.get("theme").copied(), Some(1));
    assert_eq!(lines.input_keymap_custom, Some(2), "the first line that wrote the key (spike 'findings' 4)");
    assert_eq!(lines.keymap_entries, entries(&[("copy", 2), ("paste", 3)]));
}

// Spike 2b: an implicit parent table (`[a.b]` makes `a`) must not make the file fail or lose the lines of known keys after it.
#[test]
fn spike_2b_implicit_parent_tables_do_not_lose_the_known_keys_after_them() {
    let text = "[a.b]\nk = 1\n[a.c]\nj = 2\n[input_keymap_custom]\ncopy = \"x\"\n";
    let lines = idx(text);
    assert_eq!(lines.input_keymap_custom, Some(5));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 6)]));
}

// Spike 2c: inline tables, and inline tables inside a multi-line array: the line of an element is the line it starts on.
#[test]
fn spike_2c_inline_tables_and_an_inline_array_of_tables() {
    let text = "input_keymap_custom = { copy = \"x\", paste = \"y\" }\nexternal_apps = [\n  { name = \"a\", program = \"p\" },\n  { name = \"b\", program = \"q\" },\n]\n";
    let lines = idx(text);
    assert_eq!(lines.input_keymap_custom, Some(1));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 1), ("paste", 1)]));
    assert_eq!(lines.external_apps.line, Some(2), "the key's line, although the array spans lines 2-5");
    assert_eq!(
        lines.external_apps.apps,
        vec![app(3, Some(3), Some(3), None, None), app(4, Some(4), Some(4), None, None)],
        "an inline-table element: header = the line it starts on"
    );
}

// Spike 2d: a dotted key inside an `[[external_apps]]` element: the element and its other fields keep the right lines.
#[test]
fn spike_2d_a_dotted_key_inside_an_element_does_not_disturb_the_lines() {
    let lines = idx("[[external_apps]]\nname = \"a\"\nx.y = 1\n\n[[external_apps]]\nname = \"b\"\n");
    assert_eq!(lines.external_apps.line, Some(1));
    assert_eq!(lines.external_apps.apps, vec![app(1, Some(2), None, None, None), app(5, Some(6), None, None, None)]);
}

// Spike 2e: `[external_apps.sub]` under an array of tables belongs to the last element and does not become an element.
#[test]
fn spike_2e_a_child_table_of_an_element_is_not_an_element() {
    let lines = idx("[[external_apps]]\nname = \"a\"\n[external_apps.sub]\nz = 1\n");
    assert_eq!(lines.external_apps.apps, vec![app(1, Some(2), None, None, None)]);
}

// ------------------------------------------------------------------ datetime values (spike 3a-3e): the file must not be lost

// Spike 3a: a datetime anywhere must not make `index` fail (V2, a bare `Spanned<String>` key, did) nor shift later lines.
#[test]
fn spike_3a_a_top_level_datetime_value_keeps_every_later_line() {
    let text = format!("x = 1979-05-27T07:32:00Z\n{STD}");
    let lines = idx(&text);
    assert_eq!(lines.top.get("theme").copied(), Some(2));
    assert_eq!(lines.input_keymap_custom, Some(3));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 4), ("paste", 5)]));
    assert_eq!(lines.external_apps.line, Some(7));
    assert_eq!(
        lines.external_apps.apps,
        vec![app(7, Some(8), Some(9), Some(10), None), app(12, Some(13), None, None, Some(14))]
    );
}

// Spike 3b: a datetime as the VALUE of a keymap entry (the entry is later reported as a non-string by `load`).
#[test]
fn spike_3b_a_datetime_value_in_the_keymap_table_still_has_its_line() {
    let lines = idx("[input_keymap_custom]\ncopy = 1979-05-27\npaste = \"y\"\n");
    assert_eq!(lines.input_keymap_custom, Some(1));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 2), ("paste", 3)]));
}

// Spike 3c: a datetime as an external app's field (wrong type later).
#[test]
fn spike_3c_a_datetime_in_an_external_apps_field_still_has_the_field_lines() {
    let lines = idx("[[external_apps]]\nname = 07:32:00\nprogram = \"p\"\n");
    assert_eq!(lines.external_apps.apps, vec![app(1, Some(2), Some(3), None, None)]);
}

// Spike 3d / 3e: datetimes in an array, in an inline table and in a dotted key; the known key after them keeps its line.
#[test]
fn spike_3d_3e_datetimes_in_arrays_inline_tables_and_dotted_keys() {
    for (text, expected_theme_line) in [
        ("d = [1979-05-27, 1979-05-28T01:02:03]\ntheme = \"nord\"\n", 2),
        ("t = { when = 1979-05-27 }\nu.when = 1979-05-27\ntheme = \"nord\"\n", 3),
        ("when = 1979-05-27T00:00:00+09:00\nlocal = 1979-05-27T00:32:00.5\nclock = 07:32:00\ntheme = \"nord\"\n", 4),
    ] {
        assert_eq!(idx(text).top.get("theme").copied(), Some(expected_theme_line), "text {text:?}");
    }
}

// ------------------------------------------------------------------ wrong types, unknown keys, multi-line strings (spike 4 / 4b)

// R-1642: a wrong-typed `theme`, `input_keymap_custom`, `external_apps` still have their lines (the type error is reported WITH a line).
#[test]
fn spike_4_wrong_typed_known_keys_keep_their_lines() {
    let text = "theme = 3\nui_them = \"dark\"\ninput_keymap_custom = \"x\"\nexternal_apps = \"x\"\nunknown = [1, 2, [3]]\n";
    let lines = idx(text);
    assert_eq!(lines.top.get("theme").copied(), Some(1), "AC-1640 / W-33: the line of theme even when its value is not a string");
    assert_eq!(lines.input_keymap_custom, Some(3), "W-30-2: the line of a non-table input_keymap_custom");
    assert!(lines.keymap_entries.is_empty());
    assert_eq!(lines.external_apps.line, Some(4), "W-9B: the line of a non-array external_apps");
    assert!(lines.external_apps.apps.is_empty());
}

// Spike 4b: an array that is not an array of tables, and non-string entries.
#[test]
fn spike_4b_an_array_of_scalars_and_non_string_keymap_values() {
    let lines = idx("external_apps = [1, \"x\"]\n[input_keymap_custom]\ncopy = [1]\nz = { a = 1 }\n");
    assert_eq!(lines.external_apps.line, Some(1));
    assert_eq!(lines.input_keymap_custom, Some(2));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 3), ("z", 4)]));
}

// Spike 4: lines after a multi-line string are not off by the string's length.
#[test]
fn spike_4_lines_after_a_multi_line_string_and_a_multi_line_array_are_exact() {
    let text = "mls = \"\"\"\na\nb\n\"\"\"\nm = [\n  1,\n  2,\n]\ntheme = \"nord\"\n";
    assert_eq!(idx(text).top.get("theme").copied(), Some(9));
}

// R-1642: the entry order in the file does not matter (the map is keyed by action id; the spike's case 6 had zz before aa).
#[test]
fn spike_6_the_lines_follow_the_document_not_the_alphabet() {
    let lines = idx("zeta = 1\n[input_keymap_custom]\nzz = \"a\"\naa = \"b\"\n[[external_apps]]\nname = \"n\"\n");
    assert_eq!(lines.keymap_entries, entries(&[("zz", 3), ("aa", 4)]));
    assert_eq!(lines.external_apps.apps, vec![app(5, Some(6), None, None, None)]);
}

// ------------------------------------------------------------------ BOM and CRLF (spike 5 / 5b / 5c)

// SHOULD-121 / design: "BOM は行にも数えられず、エディタで見る行と一致する" and `\r\n` counts as ONE line break.
#[test]
fn spike_5_bom_and_crlf_do_not_move_any_line() {
    let expected = idx(STD);
    assert_eq!(idx(&crlf(STD)), expected, "CRLF");
    assert_eq!(idx(&format!("\u{feff}{}", crlf(STD))), expected, "BOM + CRLF (the spike's case 5)");
    assert_eq!(idx(&format!("\u{feff}{STD}")), expected, "BOM + LF");
}

#[test]
fn spike_5b_crlf_with_comments_multi_line_values_and_a_dotted_key() {
    let text = crlf("# c\ntheme = \"nord\"\ninput_keymap_custom.copy = \"x\"\nm = [\n 1,\n 2,\n]\ns = \"\"\"\nl1\nl2\"\"\"\n[[external_apps]]\nname = \"a\"\n");
    let lines = idx(&text);
    assert_eq!(lines.top.get("theme").copied(), Some(2));
    assert_eq!(lines.input_keymap_custom, Some(3));
    assert_eq!(lines.keymap_entries, entries(&[("copy", 3)]));
    assert_eq!(lines.external_apps.line, Some(11));
    assert_eq!(lines.external_apps.apps, vec![app(11, Some(12), None, None, None)]);
}

#[test]
fn spike_5c_a_key_on_the_first_line_after_a_bom_is_line_1() {
    assert_eq!(idx("\u{feff}theme = \"nord\"\n[input_keymap_custom]\ncopy = \"x\"\n").top.get("theme").copied(), Some(1));
}

// A Japanese comment (multi-byte characters) before the keys must not shift the line or split a character.
#[test]
fn multibyte_comments_do_not_confuse_the_lines() {
    let lines = idx("## 日本語の説明です。\n## もう一行\ntheme = \"nord\"\n");
    assert_eq!(lines.top.get("theme").copied(), Some(3));
}

// ------------------------------------------------------------------ whole-text failure and "never lose the whole file"

// R-1641: a syntax error: `index` has nothing to say (the line of the error itself comes from `line_of` in `load`).
#[test]
fn a_syntax_error_yields_none_and_does_not_panic() {
    assert_eq!(index("theme = \"nord\"\nthis is = = not toml\n"), None);
    assert_eq!(index("[input_keymap_custom\n"), None);
    assert_eq!(index("a = 1\na = 2\n"), None, "a duplicate key is a TOML error too");
}

// Q-C / R-1642: "得られない項目だけ行を書かない" -- on every spike input the whole file must still be located.
#[test]
fn q_c_every_valid_spike_input_is_located_as_a_whole() {
    let inputs = [
        STD.to_string(),
        "theme = \"nord\"\ninput_keymap_custom.copy = \"x\"\n".to_string(),
        "[a.b]\nk = 1\n[a.c]\nj = 2\n".to_string(),
        "input_keymap_custom = { copy = \"x\" }\nexternal_apps = [ { name = \"a\" } ]\n".to_string(),
        "[[external_apps]]\nname = \"a\"\nx.y = 1\n".to_string(),
        "x = 1979-05-27T07:32:00Z\n".to_string(),
        "t = { when = 1979-05-27 }\nu.when = 1979-05-27\n".to_string(),
        "[[external_apps]]\nname = 07:32:00\n".to_string(),
        "theme = 3\nexternal_apps = \"x\"\nflt = 1.5\nb = true\n".to_string(),
        crlf(STD),
    ];
    for text in inputs {
        assert!(text.parse::<toml::Value>().is_ok(), "the fixture must be valid TOML: {text:?}");
        assert!(index(&text).is_some(), "index lost the whole file for {text:?}");
    }
}

// ------------------------------------------------------------------ line_of

#[test]
fn line_of_counts_line_feeds_before_the_offset_plus_one() {
    let text = "a = 1\nb = 2\r\nc = 3\n";
    assert_eq!(line_of(text, 0), 1);
    assert_eq!(line_of(text, 5), 1, "the offset of the first '\\n' is still line 1");
    assert_eq!(line_of(text, 6), 2);
    assert_eq!(line_of(text, 12), 2, "the '\\r' of CRLF does not count");
    assert_eq!(line_of(text, 13), 3);
}

#[test]
fn line_of_clamps_an_offset_past_the_end_and_never_panics_inside_a_character() {
    let text = "あいう\nえお\n";
    assert_eq!(line_of(text, usize::MAX), 3, "clamped to the text length");
    // byte 1 is inside the 3-byte 'あ': counting bytes must not slice the &str at a non-boundary
    assert_eq!(line_of(text, 1), 1);
    assert_eq!(line_of(text, 10), 2);
    assert_eq!(line_of("", 0), 1);
    assert_eq!(line_of("", 99), 1);
}

#[test]
fn line_of_does_not_count_a_leading_bom() {
    assert_eq!(line_of("\u{feff}a = 1\nb = 2\n", 9), 2, "the BOM bytes contain no line feed");
}
