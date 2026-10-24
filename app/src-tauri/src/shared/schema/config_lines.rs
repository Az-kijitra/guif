//! Line numbers and unknown settings of `config.toml`, as READ (SPEC-0300-0022 R-1642 / R-1643; SPEC-0300-0023 R-1700-1;
//! SPEC-0200-0001 §3.17.3 / §3.18). Pure data, no logic: `config/config_toml_lines.rs` fills it, `config/startup_config.rs` and
//! `external_apps/registry.rs` only hand the numbers on (the judging stays where it was, MUST-86).
//! Every line is 1-based; `None` means "not written in the file" or "could not be located".

use std::collections::BTreeMap;

/// The top-level keys that are read; any other top-level key is an unknown setting (`ui_theme` is one since SPEC-0300-0023).
pub const KNOWN_TOP_KEYS: [&str; 6] = ["input_keymap_custom", "external_apps", "theme", "colors", "font", "layout"];

/// The lines of the known keys of `config.toml`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ConfigLines {
    /// Every top-level key -> its line.
    pub top: BTreeMap<String, u32>,
    /// `theme` / `colors` / `font` / `layout` -> (key inside the table -> its line).
    pub tables: BTreeMap<String, BTreeMap<String, u32>>,
    /// The `input_keymap_custom` key, or its `[...]` header / first dotted key.
    pub input_keymap_custom: Option<u32>,
    /// Action id -> the line of that key (every key of the table, whatever its value type).
    pub keymap_entries: BTreeMap<String, u32>,
    /// The lines of `external_apps`.
    pub external_apps: ExternalAppsLines,
}

/// The lines of `external_apps` and of each of its elements (`apps[i]` is the i-th element of the array).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ExternalAppsLines {
    /// The `external_apps` key, or the FIRST `[[external_apps]]` header.
    pub line: Option<u32>,
    pub apps: Vec<AppLines>,
}

/// One `[[external_apps]]` element: its header and the fields it has.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AppLines {
    pub header: Option<u32>,
    pub name: Option<u32>,
    pub program: Option<u32>,
    pub args: Option<u32>,
    pub args_for_file: Option<u32>,
    pub key: Option<u32>,
}

/// R-1643: a setting that is not read (and changes nothing).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UnknownSetting {
    /// A top-level key that is not in `KNOWN_TOP_KEYS`.
    Top { name: String, line: Option<u32> },
    /// A field of the `position`-th (1-based) `external_apps` element other than the five of R-1500.
    AppField { position: usize, name: String, line: Option<u32> },
    /// A key inside `[theme]` / `[colors]` / `[font]` / `[layout]` that is not one of that table's keys (SPEC-0300-0023 R-1700-1).
    TableKey { table: String, name: String, line: Option<u32> },
}
