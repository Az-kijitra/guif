//! Persisted keymap schema types (SPEC-0200-0001 §6.1: schema types live
//! under `shared/schema/`, not inside `keymap/`, so that `config/` and
//! `keymap/` both depend only on `shared/` and never on each other).
//!
//! SPEC-0300-0010 R-20-1/R-41/R-42-1: a single default keymap (the profile
//! concept was removed, ISS-0105), plus a map of per-action custom
//! key-binding overrides (`input_keymap_custom`).
//!
//! No `deny_unknown_fields` (SPEC-0200-0001 §3.3.9): a `config.toml` written
//! by an older version that still contains the removed field is read without
//! error (the field is ignored) and is not written back on save.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// R-41: the `config.toml` setting for keymap configuration.
/// `#[serde(default)]` lets a config file that omits it (or omits the whole
/// table) still resolve to the empty default.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeymapConfig {
    #[serde(rename = "input_keymap_custom", default)]
    pub custom: HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // AC-55-1 (SPEC-0300-0010 6th ed.): the source tree, tests included, must
    // not contain the removed profile field name or its values as literals, so
    // they are assembled at run time (SPEC-0200-0001 §3.3.9, MUST-62).
    const LEGACY_FIELD: &str = concat!("input_keymap_", "profile");
    const LEGACY_ALT_FIELD: &str = concat!("keymap_", "profile");
    fn legacy_value() -> String {
        ["v", "im"].concat()
    }

    // SPEC-0300-0010 R-41: input_keymap_custom defaults to empty.
    #[test]
    fn r41_default_custom_overrides_are_empty() {
        let config = KeymapConfig::default();
        assert!(config.custom.is_empty());
    }

    // SPEC-0300-0010 R-41: the persisted TOML field name is exactly
    // `input_keymap_custom` (the only keymap setting after the 6th edition).
    #[test]
    fn r41_toml_field_name_is_input_keymap_custom() {
        let toml_str = r#"
            [input_keymap_custom]
            toggle_hidden = "Ctrl+Alt+H"
        "#;
        let config: KeymapConfig = toml::from_str(toml_str).expect("parse config toml");
        assert_eq!(config.custom.get("toggle_hidden"), Some(&"Ctrl+Alt+H".to_string()));
    }

    // SPEC-0300-0010 R-42-1 / AC-55 (ISS-0105): the removed profile field is NOT
    // read. A TOML that still contains it parses without error and yields the
    // same result as an empty keymap (defaults), whatever its value.
    #[test]
    fn r42_1_ac55_removed_profile_field_is_ignored_when_parsing() {
        for value in [legacy_value(), "windows".to_string(), "unknown-value".to_string()] {
            let toml_str = format!("{LEGACY_FIELD} = \"{value}\"
");
            let config: KeymapConfig = toml::from_str(&toml_str)
                .unwrap_or_else(|e| panic!("a legacy field with value {value:?} must not cause an error: {e}"));
            assert_eq!(config, KeymapConfig::default(), "key bindings must not change (value {value:?})");
        }
    }

    // R-42-1 / R-53: the removed field is ignored while `input_keymap_custom`
    // in the same file is still honoured.
    #[test]
    fn r42_1_custom_overrides_are_kept_next_to_a_removed_profile_field() {
        let toml_str = format!(
            "{LEGACY_FIELD} = \"{}\"

[input_keymap_custom]
move_up = \"K\"
",
            legacy_value()
        );
        let config: KeymapConfig = toml::from_str(&toml_str).expect("parse");
        assert_eq!(config.custom.get("move_up"), Some(&"K".to_string()));
        assert_eq!(config.custom.len(), 1);
    }

    // R-42-1 (design §3.3.9): no `deny_unknown_fields` -- unknown top-level
    // fields in general do not make parsing fail (future-field safety).
    #[test]
    fn r42_1_unknown_fields_do_not_fail_parsing() {
        let config: KeymapConfig = toml::from_str("some_future_setting = 1
").expect("parse");
        assert_eq!(config, KeymapConfig::default());
    }

    // R-42-1 / AC-55: serializing never writes the removed field back.
    #[test]
    fn r42_1_serialization_does_not_write_the_removed_profile_field() {
        let mut config = KeymapConfig::default();
        config.custom.insert("toggle_hidden".to_string(), "Ctrl+Alt+H".to_string());

        let text = toml::to_string(&config).expect("serialize");

        assert!(!text.contains(LEGACY_FIELD), "serialized: {text}");
        assert!(text.contains("input_keymap_custom"));
    }

    // SPEC-0300-0010 R-42: legacy field names (`keymap_custom` and the
    // pre-`input_` profile name) are not read as aliases; a config using only
    // the old names yields the defaults instead of silently adopting values.
    #[test]
    fn r42_legacy_field_names_are_not_treated_as_aliases() {
        let toml_str = format!(
            "{LEGACY_ALT_FIELD} = \"{}\"

[keymap_custom]
move_up = \"K\"
",
            legacy_value()
        );
        let config: KeymapConfig = toml::from_str(&toml_str).expect("parse config toml");
        assert!(config.custom.is_empty(), "keymap_custom must not be populated from the legacy name");
        assert_eq!(config, KeymapConfig::default());
    }
}
