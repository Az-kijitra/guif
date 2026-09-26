//! `config/` is the sole owner of persistence I/O (SPEC-0200-0001 §6.1). It
//! depends only on `shared/` — in particular `shared::schema::keymap::KeymapConfig`
//! — and never on `keymap/` directly, so no `config/ <-> <feature>/` cycle
//! can form (§4.2/§6.1).
//!
//! The keymap field (`input_keymap_custom`, SPEC-0300-0010 R-41) is flattened into the top level of `config.toml`
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
    use crate::shared::schema::keymap::KeymapConfig;
    use std::fs;

    // AC-55-1 (SPEC-0300-0010 6th ed.): the removed profile field's name and
    // value must not appear as literals anywhere in the source tree (tests
    // included), so they are assembled at run time (MUST-62, design §3.3.9).
    const LEGACY_FIELD: &str = concat!("input_keymap_", "profile");
    fn legacy_value() -> String {
        ["v", "im"].concat()
    }

    // SPEC-0300-0010 R-20/R-41: loading when no config file exists yet yields
    // the documented defaults (single default keymap, no custom overrides).
    #[test]
    fn load_missing_file_returns_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");

        let config = load(&path).expect("load should succeed even without a file");
        assert_eq!(config.keymap, KeymapConfig::default());
        assert!(config.keymap.custom.is_empty());
    }

    // SPEC-0300-0010 AC-33 (R-53): saving unrelated settings must not
    // overwrite or drop manually-edited `input_keymap_custom` in config.toml.
    // Since there is no keymap-editing UI (R-50/R-51), the only way it changes
    // is a human editing config.toml directly; the app's own save path for
    // other settings must round-trip it untouched.
    #[test]
    fn ac33_saving_unrelated_settings_preserves_manually_edited_keymap_custom() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        fs::write(
            &path,
            r#"
                ui_show_hidden = false

                [input_keymap_custom]
                toggle_hidden = "Ctrl+Alt+H"
            "#,
        )
        .expect("seed config.toml");

        let mut config = load(&path).expect("load");
        config.ui_show_hidden = true;
        save(&path, &config).expect("save");

        let reloaded = load(&path).expect("reload");
        assert_eq!(reloaded.keymap.custom.get("toggle_hidden"), Some(&"Ctrl+Alt+H".to_string()));
        assert!(reloaded.ui_show_hidden);
    }

    fn legacy_config_text() -> String {
        format!(
            "{LEGACY_FIELD} = \"{}\"
ui_show_hidden = true

[input_keymap_custom]
toggle_hidden = \"Ctrl+Alt+H\"
",
            legacy_value()
        )
    }

    // SPEC-0300-0010 AC-55 / R-42-1 (design §3.3.9): a config.toml that still
    // has the removed profile field loads WITHOUT error; the field is ignored,
    // `input_keymap_custom` and unrelated settings are kept.
    #[test]
    fn ac55_load_ignores_the_removed_profile_field_without_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        fs::write(&path, legacy_config_text()).expect("seed");

        let config = load(&path).expect("a legacy field must not make load fail");

        assert!(config.ui_show_hidden);
        assert_eq!(config.keymap.custom.get("toggle_hidden"), Some(&"Ctrl+Alt+H".to_string()));
        assert_eq!(config.keymap.custom.len(), 1);
    }

    // AC-55: with ONLY the removed field present, key bindings stay the
    // default (empty custom overrides == default keymap).
    #[test]
    fn ac55_a_config_with_only_the_removed_field_equals_the_default() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        fs::write(&path, format!("{LEGACY_FIELD} = \"{}\"
", legacy_value())).expect("seed");

        let config = load(&path).expect("load");

        assert_eq!(config, Config::default());
    }

    // R-42-1 (design §3.3.9): saving does not write the removed field back --
    // it disappears -- while `input_keymap_custom` (R-53) survives the round trip.
    #[test]
    fn r42_1_save_drops_the_removed_field_and_keeps_custom() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        fs::write(&path, legacy_config_text()).expect("seed");

        let config = load(&path).expect("load");
        save(&path, &config).expect("save");

        let text = fs::read_to_string(&path).expect("read back");
        assert!(!text.contains(LEGACY_FIELD), "the removed field must not be written back:
{text}");
        let reloaded = load(&path).expect("reload");
        assert_eq!(reloaded, config);
        assert_eq!(reloaded.keymap.custom.get("toggle_hidden"), Some(&"Ctrl+Alt+H".to_string()));
    }

    // A freshly saved default config never contains the removed field either.
    #[test]
    fn saving_the_default_config_does_not_contain_the_removed_field() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");

        save(&path, &Config::default()).expect("save");

        assert!(!fs::read_to_string(&path).expect("read").contains(LEGACY_FIELD));
    }

    // Design §3.3.9 pitfall: `Config` keeps `#[serde(flatten)]` for the keymap
    // part, so `input_keymap_custom` stays a TOP-LEVEL table (R-41 shape), not
    // nested under e.g. `[keymap]`.
    #[test]
    fn flatten_is_kept_input_keymap_custom_is_a_top_level_table() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        let mut config = Config::default();
        config.keymap.custom.insert("toggle_hidden".to_string(), "Ctrl+Alt+H".to_string());

        save(&path, &config).expect("save");

        let text = fs::read_to_string(&path).expect("read");
        assert!(text.contains("[input_keymap_custom]"), "{text}");
        assert!(!text.contains("[keymap]"), "keymap must stay flattened: {text}");
    }

    // Design §3.3.9 / io.rs field-order note: scalar fields precede the table,
    // so serialization does not fail with "values must be emitted before
    // tables" and the scalar really comes first in the file.
    #[test]
    fn field_order_scalar_before_table_is_kept() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("config.toml");
        let mut config = Config { ui_show_hidden: true, ..Config::default() };
        config.keymap.custom.insert("toggle_hidden".to_string(), "Ctrl+Alt+H".to_string());

        save(&path, &config).expect("save must not fail on field order");

        let text = fs::read_to_string(&path).expect("read");
        let scalar_at = text.find("ui_show_hidden").expect("scalar written");
        let table_at = text.find("[input_keymap_custom]").expect("table written");
        assert!(scalar_at < table_at, "scalar must precede the table:
{text}");
        assert_eq!(load(&path).expect("reload"), config);
    }
}
