//! The start-up snapshot of `config.toml` and the `config_load_keymap` DTO (SPEC-0300-0010 R-45 / SPEC-0300-0017 R-917;
//! SPEC-0300-0022 R-1642 / R-1643 / R-1654; SPEC-0200-0001 §3.11.2 / §3.11.4 / §3.17.3, moved here from `commands.rs`).
//!
//! `config.toml` is read by `StartupConfig::load` -- once at start-up (R-917-8) and, as a non-reflecting read, once per
//! "設定ファイルのチェック" (R-1652, both through `config_bridge::evaluate::snapshot`). The result is a value: changes made to
//! the file while the app runs are not applied until a restart (R-917-2), and a page reload does not read the file again.

use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use super::config_toml::{self, ConfigTomlLoadResult, KeymapParseError, KeymapRawLoadResult};
use super::paths;
use crate::shared::schema::config_lines::UnknownSetting;
use crate::shared::schema::ui_theme::{interpret_ui_theme, ThemeResolution, ThemeSetting};

/// The single place that resolves the `config.toml` path (SHOULD-183 (a), M-1 of SPEC-0200-0001 §3.17): `StartupConfig::load`,
/// `config_bridge/open.rs` and `config_bridge/sample_startup.rs` (whose folder is the parent of this path) all go through it.
pub fn locate(app: &AppHandle) -> io::Result<PathBuf> {
    paths::config_path(app)
}

/// The snapshot of `config.toml` (`.manage()`d by `lib.rs` after the one and only start-up read).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartupConfig {
    pub loaded: ConfigTomlLoadResult,
    pub theme: ThemeResolution,
}

impl StartupConfig {
    /// The path goes to `from_path` and nowhere else (SHOULD-183 (c)). A path-resolution failure is handled like an
    /// unreadable file (R-917-5 (2)); an invalid `REFLEXFILES_CONFIG_DIR` was already rejected by `lib.rs`.
    pub fn load(app: &AppHandle) -> Self {
        match locate(app) {
            Ok(path) => Self::from_path(&path),
            Err(e) => Self::unreadable(e.to_string()),
        }
    }

    pub fn from_path(path: &Path) -> Self {
        Self::from_loaded(config_toml::load(path))
    }

    pub fn from_loaded(loaded: ConfigTomlLoadResult) -> Self {
        let theme = interpret_ui_theme(&loaded.ui_theme);
        Self { loaded, theme }
    }

    /// R-917-5 (2) without a file read: the whole file counts as unreadable and the theme follows the OS. It is `present`
    /// (the check says W-31, never "no config.toml", R-1654).
    pub fn unreadable(message: String) -> Self {
        Self::from_loaded(ConfigTomlLoadResult {
            keymap: KeymapRawLoadResult {
                entries: Vec::new(),
                parse_error: Some(KeymapParseError { message, line: None, whole_file: true }),
            },
            present: true,
            ..ConfigTomlLoadResult::default()
        })
    }

    /// What `config_load_keymap` returns: a copy of the snapshot, no file access.
    pub fn to_dto(&self) -> KeymapLoadResultDto {
        let keymap = &self.loaded.keymap;
        let lines = &self.loaded.lines;
        KeymapLoadResultDto {
            entries: keymap
                .entries
                .iter()
                .map(|e| KeymapRawEntryDto {
                    action_id: e.action_id.clone(),
                    value: e.value.clone(),
                    line: lines.keymap_entries.get(&e.action_id).copied(),
                })
                .collect(),
            parse_error: keymap.parse_error.as_ref().map(|e| KeymapParseErrorDto {
                message: e.message.clone(),
                line: e.line,
                whole_file: e.whole_file,
            }),
            ui_theme: match self.theme.setting {
                ThemeSetting::System => "system",
                ThemeSetting::Light => "light",
                ThemeSetting::Dark => "dark",
            }
            .to_string(),
            ui_theme_invalid: self.theme.invalid,
            ui_theme_line: lines.ui_theme,
            present: self.loaded.present,
            unknown_settings: self.loaded.unknown.iter().map(UnknownSettingDto::from).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapRawEntryDto {
    pub action_id: String,
    pub value: Option<String>,
    /// R-1642: the line of this key in `config.toml`.
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapParseErrorDto {
    pub message: String,
    pub line: Option<u32>,
    pub whole_file: bool,
}

/// R-1643 on the wire: `kind` is `"key"` (a top-level key) or `"appField"` (a field of the `position`-th element).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnknownSettingDto {
    pub kind: &'static str,
    pub name: String,
    pub position: Option<usize>,
    pub line: Option<u32>,
}

impl From<&UnknownSetting> for UnknownSettingDto {
    fn from(setting: &UnknownSetting) -> Self {
        match setting {
            UnknownSetting::Top { name, line } => Self { kind: "key", name: name.clone(), position: None, line: *line },
            UnknownSetting::AppField { position, name, line } => {
                Self { kind: "appField", name: name.clone(), position: Some(*position), line: *line }
            }
        }
    }
}

/// The command keeps its name (§3.11.4) although it now carries the whole `config.toml` snapshot.
/// `ui_theme` is the interpreted value, a public value for verification only (the screen's brightness is
/// decided by CSS, not by this).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapLoadResultDto {
    pub entries: Vec<KeymapRawEntryDto>,
    pub ui_theme: String,
    pub ui_theme_invalid: bool,
    pub parse_error: Option<KeymapParseErrorDto>,
    /// R-1642 (W-33): the line of `ui_theme`.
    pub ui_theme_line: Option<u32>,
    /// R-1654 (W-AB): the file was there.
    pub present: bool,
    pub unknown_settings: Vec<UnknownSettingDto>,
}
