//! Line numbers and unknown settings of `config.toml`, as READ (SPEC-0300-0022 R-1642 / R-1643; SPEC-0200-0001
//! §3.17.3). Pure data, no logic: `config/config_toml_lines.rs` fills it, `config/startup_config.rs` and
//! `external_apps/registry.rs` only hand the numbers on (the judging stays where it was, MUST-86).
//! Every line is 1-based; `None` means "not written in the file" or "could not be located".

use std::collections::BTreeMap;

/// The lines of the known keys of `config.toml`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ConfigLines {
    /// The `ui_theme` key (whatever its value type).
    pub ui_theme: Option<u32>,
    /// The `input_keymap_custom` key, or its `[...]` header / first dotted key.
    pub input_keymap_custom: Option<u32>,
    /// Action id -> the line of that key (every key of the table, whatever its value type).
    pub keymap_entries: BTreeMap<String, u32>,
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
    /// A top-level key other than `ui_theme` / `input_keymap_custom` / `external_apps`.
    Top { name: String, line: Option<u32> },
    /// A field of the `position`-th (1-based) `external_apps` element other than the five of R-1500.
    AppField { position: usize, name: String, line: Option<u32> },
}
