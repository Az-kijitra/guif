//! `config/config_toml.rs` (renamed from `keymap.rs`, SPEC-0200-0001 §3.11.3 H-1): reads `config.toml`
//! at startup, ONCE, in ONE TOML parse: the `input_keymap_custom` table (SPEC-0300-0010 R-45;
//! §3.6.11.3, MUST-86 "recommendation A") and the top-level `ui_theme` (SPEC-0300-0017 R-917).
//! This module hands back each keymap entry's RAW value plus a structural parse error (with a 1-based
//! line number when one can be recovered) and the RAW `ui_theme`; it performs NO per-element validation:
//! no known-action-id check (R-45-4 (i)), no key-string grammar check (R-45-4-1), no `delete`+Shift
//! rejection (R-18-2) -- all of that lives in the TypeScript
//! `features/keyboard/keymap-validate.ts::validateKeymapEntries` (§6.1: `config/` may not own
//! key-processing logic; the previous design that put this validation in Rust was withdrawn by
//! architecture-guardian MUST-86 because it re-implemented the grammar a second time and drifted from
//! the actual TS-side matcher, see docs/architecture/proposals/SPEC-0200-0001.md §3.6.11.3). Judging the
//! words of `ui_theme` is `shared::schema::ui_theme::interpret_ui_theme`'s job (R-917-3).
//!
//! `config/config_toml.rs` is also the ONLY reader of `config.toml` (MUST-92 as rewritten by H-1 and again by
//! SPEC-0200-0001 §3.17.4): `config/` has no write path for `config.toml` (`config/io.rs`, the former read/write module,
//! was deleted). The one writer in the crate is `settings_file/scaffold.rs::create_template_if_missing`, a create-new that
//! never opens an existing file (SPEC-0300-0022 R-1610). AC-63/AC-630/AC-960 ("app operations never change config.toml's
//! bytes or mtime") are therefore checked against THIS module's `load` alone.
//!
//! SPEC-0300-0022 (R-1642 / R-1643): the same text is also indexed by `config_toml_lines` (the 1-based line of each key, and the
//! unknown settings in document order). `load` still reads the file once and judges nothing more than before.
//!
//! ```ignore
//! pub fn load(path: &Path) -> ConfigTomlLoadResult
//! ```
//!
//! - Missing file (`NotFound`) => the default result: no entries, no error, `ui_theme: Missing`
//!   (R-45-1 / R-917-5 (1): no notice, no file is created).
//! - The whole file cannot be read (a TOML syntax error, non-UTF-8 bytes, or any other I/O error such as
//!   a permission error) => `keymap.parse_error: Some { whole_file: true }` and `ui_theme: Missing`
//!   (R-917-5 (2); the file is NEVER renamed, backed up, or rewritten -- unlike
//!   `config::navigation`/`config::ui_state`, there is no `.bak` recovery here, because `config.toml` is
//!   a human-edited, read-only-to-the-app file). `line` is `None` when no byte offset is available
//!   (SHOULD-121).
//! - The file parses as TOML but `input_keymap_custom` is not a table => `entries: []`,
//!   `parse_error: Some { whole_file: false }`, and `ui_theme` is read as usual (R-917-5 (3), 確定 #16).
//! - Otherwise every key of the table becomes one `RawKeymapEntry`; `value` is `Some(s)` when the TOML
//!   value is a string, `None` for any other type (AC-62 (iv) / MUST-86 (iv), e.g. `sort_menu = 123`).

use std::fs;
use std::io;
use std::path::Path;

use super::config_toml_lines::{index_full, line_of};
use crate::shared::schema::config_lines::{ConfigLines, UnknownSetting};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};
use crate::shared::schema::ui_theme::UiThemeRaw;

/// One raw `input_keymap_custom` table entry, before any validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawKeymapEntry {
    pub action_id: String,
    /// `None` when the TOML value exists but is not a string (AC-62 (iv)).
    pub value: Option<String>,
}

/// R-45-2: a structural failure. `line` is the 1-based line number derived from the underlying
/// `toml::de::Error`'s byte-offset span, when one is available. `whole_file` tells whether the WHOLE
/// file could not be read (R-917-5 (2): the notice also says the theme fell back to the default) or
/// only `input_keymap_custom` had the wrong type (R-917-5 (3): the theme is unaffected).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeymapParseError {
    pub message: String,
    pub line: Option<u32>,
    pub whole_file: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct KeymapRawLoadResult {
    pub entries: Vec<RawKeymapEntry>,
    /// `Some` only for a failure (R-45-2/R-45-3); never set together with a non-empty `entries`.
    pub parse_error: Option<KeymapParseError>,
}

/// Everything read from `config.toml` in one go (R-917-8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigTomlLoadResult {
    pub keymap: KeymapRawLoadResult,
    pub ui_theme: UiThemeRaw,
    /// SPEC-0300-0021 R-1500: the top-level `external_apps`, RAW (R-1503: judged by `external_apps/registry.rs`).
    pub external_apps: ExternalAppsRaw,
    /// R-1644 / R-1654: the file was there (everything but `NotFound`; an unreadable file IS present: W-31, not "no file").
    pub present: bool,
    /// R-1642: the line of each known key. All `None` / empty when the file is absent, unreadable or has a syntax error.
    pub lines: ConfigLines,
    /// R-1643: the settings that are not read, in document order (key order only if the index could not be made).
    pub unknown: Vec<UnknownSetting>,
}

impl Default for ConfigTomlLoadResult {
    fn default() -> Self {
        Self {
            keymap: KeymapRawLoadResult::default(),
            ui_theme: UiThemeRaw::Missing,
            external_apps: ExternalAppsRaw::Missing,
            present: false,
            lines: ConfigLines::default(),
            unknown: Vec::new(),
        }
    }
}

/// R-917-5 (2): the whole file is unreadable; the theme falls back with the keymap.
fn whole_file_failure(message: String, line: Option<u32>) -> ConfigTomlLoadResult {
    ConfigTomlLoadResult {
        keymap: KeymapRawLoadResult {
            entries: Vec::new(),
            parse_error: Some(KeymapParseError { message, line, whole_file: true }),
        },
        present: true,
        ..ConfigTomlLoadResult::default()
    }
}

/// Recovers a 1-based line number from a `toml::de::Error`'s byte-offset span
/// (SHOULD-121 / R-45-2), when one is available.
fn line_number_from_span(err: &toml::de::Error, text: &str) -> Option<u32> {
    Some(line_of(text, err.span()?.start))
}

/// R-1643 without positions (only when the position-keeping parse failed although `toml::Value` succeeded): alphabetical.
fn unknown_from_value(table: &toml::value::Table) -> Vec<UnknownSetting> {
    const KNOWN: [&str; 3] = ["ui_theme", "input_keymap_custom", "external_apps"];
    const APP_FIELDS: [&str; 5] = ["name", "program", "args", "args_for_file", "key"];
    let mut unknown: Vec<UnknownSetting> =
        table.keys().filter(|k| !KNOWN.contains(&k.as_str())).map(|k| UnknownSetting::Top { name: k.clone(), line: None }).collect();
    if let Some(toml::Value::Array(items)) = table.get("external_apps") {
        if items.iter().all(toml::Value::is_table) {
            for (i, item) in items.iter().filter_map(toml::Value::as_table).enumerate() {
                let fields = item.keys().filter(|k| !APP_FIELDS.contains(&k.as_str()));
                unknown.extend(fields.map(|k| UnknownSetting::AppField { position: i + 1, name: k.clone(), line: None }));
            }
        }
    }
    unknown
}

/// The top-level `ui_theme` as it is, unjudged (R-917-3).
fn raw_ui_theme(table: &toml::value::Table) -> UiThemeRaw {
    match table.get("ui_theme") {
        None => UiThemeRaw::Missing,
        Some(toml::Value::String(s)) => UiThemeRaw::Str(s.clone()),
        Some(_) => UiThemeRaw::WrongType,
    }
}

fn raw_string(table: &toml::value::Table, key: &str) -> RawValue<String> {
    match table.get(key) {
        None => RawValue::Missing,
        Some(toml::Value::String(s)) => RawValue::Value(s.clone()),
        Some(_) => RawValue::WrongType,
    }
}

/// An array whose elements are ALL strings; anything else is a type error of the field (R-1503 3).
fn raw_string_list(table: &toml::value::Table, key: &str) -> RawValue<Vec<String>> {
    match table.get(key) {
        None => RawValue::Missing,
        Some(toml::Value::Array(items)) => {
            let strings: Option<Vec<String>> = items.iter().map(|v| v.as_str().map(str::to_string)).collect();
            strings.map_or(RawValue::WrongType, RawValue::Value)
        }
        Some(_) => RawValue::WrongType,
    }
}

/// The top-level `external_apps` as it is (R-1500 / R-1503 / R-1504): absent -> `Missing`; an array of tables ->
/// the elements verbatim, unvalidated (unknown fields dropped); anything else, including an array with a
/// non-table element, -> `WrongType` as a whole (design question Q-1).
fn raw_external_apps(table: &toml::value::Table) -> ExternalAppsRaw {
    match table.get("external_apps") {
        None => ExternalAppsRaw::Missing,
        Some(toml::Value::Array(items)) => {
            let apps: Option<Vec<RawExternalApp>> = items
                .iter()
                .map(|item| {
                    item.as_table().map(|t| RawExternalApp {
                        name: raw_string(t, "name"),
                        program: raw_string(t, "program"),
                        args: raw_string_list(t, "args"),
                        args_for_file: raw_string_list(t, "args_for_file"),
                        key: raw_string(t, "key"),
                    })
                })
                .collect();
            apps.map_or(ExternalAppsRaw::WrongType, ExternalAppsRaw::Array)
        }
        Some(_) => ExternalAppsRaw::WrongType,
    }
}

pub fn load(path: &Path) -> ConfigTomlLoadResult {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return ConfigTomlLoadResult::default(),
        Err(e) => return whole_file_failure(e.to_string(), None),
    };

    let text = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => return whole_file_failure(e.to_string(), None),
    };
    // A leading UTF-8 BOM (a legacy Notepad artifact) must not make an
    // otherwise-valid file look corrupt.
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);

    let value: toml::Value = match text.parse() {
        Ok(v) => v,
        Err(e) => return whole_file_failure(e.to_string(), line_number_from_span(&e, text)),
    };

    let Some(table) = value.as_table() else { return ConfigTomlLoadResult { present: true, ..ConfigTomlLoadResult::default() } };
    let ui_theme = raw_ui_theme(table);
    // R-1642 / R-1643: a second parse of the SAME text (the file is not read again) for the lines and the unknown settings.
    let (lines, unknown) = match index_full(text) {
        Some(indexed) => (indexed.lines, indexed.unknown),
        None => (ConfigLines::default(), unknown_from_value(table)),
    };

    let keymap = match table.get("input_keymap_custom") {
        None => KeymapRawLoadResult::default(),
        Some(toml::Value::Table(entries_table)) => {
            let entries = entries_table
                .iter()
                .map(|(action_id, value)| RawKeymapEntry {
                    action_id: action_id.clone(),
                    value: value.as_str().map(|s| s.to_string()),
                })
                .collect();
            KeymapRawLoadResult { entries, parse_error: None }
        }
        Some(_) => KeymapRawLoadResult {
            entries: Vec::new(),
            parse_error: Some(KeymapParseError {
                message: "input_keymap_custom must be a table".to_string(),
                line: lines.input_keymap_custom,
                whole_file: false,
            }),
        },
    };
    ConfigTomlLoadResult { keymap, ui_theme, external_apps: raw_external_apps(table), present: true, lines, unknown }
}
