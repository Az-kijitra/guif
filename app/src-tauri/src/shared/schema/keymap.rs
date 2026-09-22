//! Persisted keymap schema types (SPEC-0200-0001 §6.1: schema types live
//! under `shared/schema/`, not inside `keymap/`, so that `config/` and
//! `keymap/` both depend only on `shared/` and never on each other).
//!
//! SPEC-0300-0010 R-20/R-41: two profiles (`windows` default, `vim`), plus a
//! map of per-action custom key-binding overrides.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// R-20: default keymap profile is `windows`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeymapProfile {
    Windows,
    Vim,
}

impl Default for KeymapProfile {
    fn default() -> Self {
        KeymapProfile::Windows
    }
}

/// R-41: the two `config.toml` fields for keymap configuration.
/// `#[serde(default)]` on both fields lets a config file that omits them
/// (or omits the whole table) still resolve to the defaults below.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeymapConfig {
    #[serde(rename = "input_keymap_profile", default)]
    pub profile: KeymapProfile,
    #[serde(rename = "input_keymap_custom", default)]
    pub custom: HashMap<String, String>,
}

impl Default for KeymapConfig {
    fn default() -> Self {
        KeymapConfig {
            profile: KeymapProfile::default(),
            custom: HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // SPEC-0300-0010 R-20: "windows" is the default profile.
    #[test]
    fn r20_default_profile_is_windows() {
        let profile = KeymapProfile::default();
        assert_eq!(profile, KeymapProfile::Windows);
    }

    // SPEC-0300-0010 R-41: input_keymap_custom defaults to empty.
    #[test]
    fn r41_default_custom_overrides_are_empty() {
        let config = KeymapConfig::default();
        assert_eq!(config.profile, KeymapProfile::Windows);
        assert!(config.custom.is_empty());
    }

    // SPEC-0300-0010 R-41: the persisted TOML field names are exactly
    // `input_keymap_profile` / `input_keymap_custom`.
    #[test]
    fn r41_toml_field_names_are_input_keymap_profile_and_input_keymap_custom() {
        let toml_str = r#"
            input_keymap_profile = "vim"

            [input_keymap_custom]
            toggle_hidden = "Ctrl+Alt+H"
        "#;
        let config: KeymapConfig = toml::from_str(toml_str).expect("parse config toml");
        assert_eq!(config.profile, KeymapProfile::Vim);
        assert_eq!(
            config.custom.get("toggle_hidden"),
            Some(&"Ctrl+Alt+H".to_string())
        );
    }

    // SPEC-0300-0010 R-42: legacy field names (`keymap_profile` / `keymap_custom`)
    // are not read as aliases; a config file using only the old names must fall
    // back to the new defaults rather than silently adopting the old values.
    #[test]
    fn r42_legacy_field_names_are_not_treated_as_aliases() {
        let toml_str = r#"
            keymap_profile = "vim"

            [keymap_custom]
            move_up = "K"
        "#;
        let config: KeymapConfig = toml::from_str(toml_str).expect("parse config toml");
        assert_eq!(config.profile, KeymapProfile::Windows); // default, not "vim"
        assert!(config.custom.is_empty()); // default, not populated from keymap_custom
    }
}
