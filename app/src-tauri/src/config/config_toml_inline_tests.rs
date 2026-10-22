//! Tests of `config_toml::load` that used to sit inline in `config_toml.rs` (moved here unchanged, SPEC-0200-0001 §3.17.13 / S-7:
//! `config_toml.rs` was 415 lines; the inline test module of about 210 lines goes to its own file so that the production file
//! stays under the line guide). The names, the specs they pin (R-45 / R-917 / MUST-86 / MUST-92 / SHOULD-121) and the bodies
//! are the ones of the former `mod tests`; nothing is added or weakened. New line-number / unknown-setting tests are in
//! `config_toml_lines_tests.rs` and `config_toml_load_lines_tests.rs`.

use std::fs;

use super::config_toml::{load, RawKeymapEntry};

fn sorted(mut entries: Vec<RawKeymapEntry>) -> Vec<RawKeymapEntry> {
    entries.sort_by(|a, b| a.action_id.cmp(&b.action_id));
    entries
}

// R-45-1/AC-61 (i): a missing config.toml is normal -- empty entries, no
// error, and (implicitly) no file is created by `load` itself.
#[test]
fn missing_file_returns_empty_entries_and_no_parse_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");

    let r = load(&path).keymap;

    assert_eq!(r.entries, Vec::new());
    assert!(r.parse_error.is_none());
    assert!(!path.exists(), "load must never create config.toml");
}

// R-45-3/AC-61 (ii): a TOML syntax error never renames/backs up/rewrites
// the file -- unlike navigation.rs/ui_state.rs there is no `.bak` here.
#[test]
fn syntax_error_yields_a_parse_error_and_leaves_the_file_byte_for_byte_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let bad = "this is = = not toml [[[";
    fs::write(&path, bad).unwrap();

    let r = load(&path).keymap;

    assert_eq!(r.entries, Vec::new());
    assert!(r.parse_error.is_some());
    assert_eq!(fs::read_to_string(&path).unwrap(), bad, "config.toml must be byte-for-byte unchanged");
    assert!(!dir.path().join("config.toml.bak").exists(), "no backup file is ever created for config.toml");
}

// R-45-2: a line number is recovered for a syntax error later in the file.
#[test]
fn syntax_error_reports_a_1_based_line_number_when_recoverable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    // Line 1 is valid; line 3 breaks (unterminated table header).
    fs::write(&path, "ui_show_hidden = false\n\n[input_keymap_custom\n").unwrap();

    let r = load(&path).keymap;

    let err = r.parse_error.expect("must be a parse error");
    assert!(err.line.is_some(), "a line number must be recoverable for this error: {err:?}");
    assert!(!err.message.is_empty());
}

// R-45-4 (ii)/MUST-86: `input_keymap_custom` present but not a table is a
// whole-file failure, distinct from a per-element issue.
#[test]
fn input_keymap_custom_that_is_not_a_table_is_a_parse_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, "input_keymap_custom = \"not a table\"\n").unwrap();

    let r = load(&path).keymap;

    assert_eq!(r.entries, Vec::new());
    assert!(r.parse_error.is_some());
}

// R-45: a config.toml with no input_keymap_custom table at all is fine
// (empty overrides, no error) -- comments/unrelated settings are ignored.
#[test]
fn a_config_with_no_input_keymap_custom_table_yields_empty_entries_without_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, "# a comment\nsome_future_setting = 1\n").unwrap();

    let r = load(&path).keymap;

    assert_eq!(r.entries, Vec::new());
    assert!(r.parse_error.is_none());
}

// R-45: every key of the table becomes one raw entry, string values kept
// verbatim (no grammar/known-id validation performed here, MUST-86).
#[test]
fn valid_string_entries_are_returned_verbatim_unvalidated() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(
        &path,
        "ui_show_hidden = false\n\n[input_keymap_custom]\ntoggle_hidden = \"Ctrl+Alt+H\"\nundo = \"Ctrl+Z\"\n",
    )
    .unwrap();

    let r = load(&path).keymap;

    assert!(r.parse_error.is_none());
    assert_eq!(
        sorted(r.entries),
        sorted(vec![
            RawKeymapEntry { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()) },
            // "undo" is not one of the 34 known action ids -- MUST-86: this
            // module does NOT filter it out, that is keymap-validate.ts's job.
            RawKeymapEntry { action_id: "undo".into(), value: Some("Ctrl+Z".into()) },
        ])
    );
}

// AC-62 (iv)/MUST-86 (iv): a non-string value (e.g. `sort_menu = 123`)
// becomes `value: None`, not a whole-file failure.
#[test]
fn a_non_string_value_becomes_value_none_without_failing_the_whole_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, "[input_keymap_custom]\nsort_menu = 123\ntoggle_time = \"Ctrl+Alt+T\"\n").unwrap();

    let r = load(&path).keymap;

    assert!(r.parse_error.is_none());
    assert_eq!(
        sorted(r.entries),
        sorted(vec![
            RawKeymapEntry { action_id: "sort_menu".into(), value: None },
            RawKeymapEntry { action_id: "toggle_time".into(), value: Some("Ctrl+Alt+T".into()) },
        ])
    );
}

// R-31: an empty string is a perfectly valid value (disables the action)
// -- it is NOT the same as a non-string value, and must round-trip as
// `Some("")`, not `None`.
#[test]
fn an_empty_string_value_is_kept_as_some_empty_string_not_none() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, "[input_keymap_custom]\nhelp_keymap = \"\"\n").unwrap();

    let r = load(&path).keymap;

    assert_eq!(r.entries, vec![RawKeymapEntry { action_id: "help_keymap".into(), value: Some(String::new()) }]);
}

// Non-UTF-8 bytes are a parse failure too (SHOULD-121), like navigation.rs.
#[test]
fn non_utf8_bytes_are_a_parse_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let bytes: Vec<u8> = vec![0xff, 0xfe, 0x00, 0xc3, 0x28, 0xa0, 0xa1];
    fs::write(&path, &bytes).unwrap();

    let r = load(&path).keymap;

    assert_eq!(r.entries, Vec::new());
    assert!(r.parse_error.is_some());
    assert_eq!(fs::read(&path).unwrap(), bytes, "config.toml must be byte-for-byte unchanged");
}

// SHOULD-121: a non-NotFound I/O error (e.g. the path is a directory) is
// also a parse error, with no line number available.
#[test]
fn a_non_notfound_io_error_is_a_parse_error_with_no_line_number() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::create_dir(&path).unwrap();

    let r = load(&path).keymap;

    let err = r.parse_error.expect("a directory at the path must be reported as a parse error");
    assert!(err.line.is_none());
}

// Regression (§19 第14回 "参考(非ブロッカー)": UTF-8 BOM'd config.toml, a
// legacy Notepad artifact, must not be treated as corrupt.
#[test]
fn a_leading_utf8_bom_does_not_make_a_valid_file_a_parse_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(b"[input_keymap_custom]\ntoggle_hidden = \"Ctrl+Alt+H\"\n");
    fs::write(&path, &bytes).unwrap();

    let r = load(&path).keymap;

    assert!(r.parse_error.is_none(), "a BOM-prefixed valid config.toml must still load: {r:?}");
    assert_eq!(r.entries, vec![RawKeymapEntry { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()) }]);
}

// AC-63/AC-630 (MUST-92): `config.toml`'s content AND mtime are
// byte-for-byte unchanged by loading it -- config/config_toml.rs is a
// read-only path (R-77-4/R-53). Repeated loads must not touch the file
// either.
#[test]
fn ac63_ac630_load_never_modifies_config_tomls_content_or_mtime() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let original =
        "# a hand-edited config.toml\nui_show_hidden = false\n\n[input_keymap_custom]\ntoggle_hidden = \"Ctrl+Alt+H\"\n";
    fs::write(&path, original).unwrap();
    let mtime_before = fs::metadata(&path).unwrap().modified().unwrap();

    load(&path);
    load(&path);

    let mtime_after = fs::metadata(&path).unwrap().modified().unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), original, "content must be byte-for-byte unchanged");
    assert_eq!(mtime_before, mtime_after, "mtime must be unchanged (no write ever happens)");
    let entries: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
    assert_eq!(entries.len(), 1, "load must never create a sibling file (no .bak, no .tmp)");
}
