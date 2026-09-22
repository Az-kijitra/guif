//! `config/` is the sole owner of persistence I/O (SPEC-0200-0001 §6.1). It
//! depends only on `shared/` — in particular `shared::schema::keymap::KeymapConfig`
//! — and never on `keymap/` directly, so no `config/ <-> <feature>/` cycle
//! can form (§4.2/§6.1).
//!
//! The keymap fields (`input_keymap_profile` / `input_keymap_custom`,
//! SPEC-0300-0010 R-41) are flattened into the top level of `config.toml`
//! rather than nested under a `[keymap]` table, matching the flat TOML shape
//! defined by R-41.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::shared::schema::keymap::KeymapConfig;

/// The application's persisted configuration. `ui_show_hidden` is a
/// representative "unrelated setting" alongside the flattened keymap fields;
/// further settings fields are added as later features need persistence.
///
/// Field order matters for TOML serialization: scalar fields must precede
/// table-like fields (the `toml` crate rejects a scalar written after a
/// table at the same nesting level), so `ui_show_hidden` (scalar) is
/// declared before the flattened `keymap` fields (whose `custom` map
/// serializes as a table).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub ui_show_hidden: bool,
    #[serde(flatten)]
    pub keymap: KeymapConfig,
}

/// Load the configuration from `path`. A missing file yields the documented
/// defaults (R-20/R-41) rather than an error, since "no config file yet" is
/// the normal first-run state.
pub fn load(path: &Path) -> io::Result<Config> {
    if !path.exists() {
        return Ok(Config::default());
    }
    let contents = fs::read_to_string(path)?;
    toml::from_str(&contents).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// Save the configuration to `path`, overwriting any existing file.
/// R-53: this is the application's only write path for `config.toml`; it
/// round-trips whatever is currently held in `Config` (including
/// manually-edited keymap fields that were loaded via `load`) rather than
/// reconstructing the keymap fields from scratch.
pub fn save(path: &Path, config: &Config) -> io::Result<()> {
    let serialized =
        toml::to_string_pretty(config).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(path, serialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schema::keymap::KeymapProfile;
    use std::fs;

    // SPEC-0300-0010 R-20/R-41: loading when no config file exists yet yields
    // the documented defaults (profile = windows, no custom overrides).
    #[test]
    fn load_missing_file_returns_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");

        let config = load(&path).expect("load should succeed even without a file");
        assert_eq!(config.keymap.profile, KeymapProfile::Windows);
        assert!(config.keymap.custom.is_empty());
    }

    // SPEC-0300-0010 AC-33 (R-53): saving unrelated settings must not
    // overwrite or drop manually-edited keymap fields in config.toml. Since
    // there is no keymap-editing UI (R-50/R-51), the only way keymap fields
    // change is a human editing config.toml directly; the app's own save
    // path for other settings must round-trip them untouched.
    #[test]
    fn ac33_saving_unrelated_settings_preserves_manually_edited_keymap_fields() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        fs::write(
            &path,
            r#"
                input_keymap_profile = "vim"
                ui_show_hidden = false

                [input_keymap_custom]
                toggle_hidden = "Ctrl+Alt+H"
            "#,
        )
        .expect("seed config.toml");

        let mut config = load(&path).expect("load");
        assert_eq!(config.keymap.profile, KeymapProfile::Vim);

        // Simulate the application saving an unrelated general setting
        // (e.g. from a future settings screen) — the keymap fields are never
        // touched by application code (R-53: read-only from the app's
        // perspective).
        config.ui_show_hidden = true;
        save(&path, &config).expect("save");

        let reloaded = load(&path).expect("reload");
        assert_eq!(reloaded.keymap.profile, KeymapProfile::Vim);
        assert_eq!(
            reloaded.keymap.custom.get("toggle_hidden"),
            Some(&"Ctrl+Alt+H".to_string())
        );
        assert!(reloaded.ui_show_hidden);
    }
}
