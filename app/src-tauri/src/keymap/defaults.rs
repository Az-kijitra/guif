//! `keymap/` owns default-value logic (and, eventually, key-processing
//! logic) only — it never performs persistence I/O itself (SPEC-0200-0001
//! §6.1: persistence is `config/`'s sole responsibility). This module is the
//! single place `config/` calls into when it needs to materialize a keymap
//! default for a first-run `config.toml` (see `crate::config::io`).

use crate::shared::schema::keymap::KeymapConfig;

/// SPEC-0300-0010 R-20/R-41: the default keymap configuration (profile =
/// windows, no custom overrides). Delegates to `KeymapConfig::default()` so
/// there is a single source of truth for the default value.
pub fn default_keymap_config() -> KeymapConfig {
    KeymapConfig::default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schema::keymap::{KeymapConfig, KeymapProfile};

    // SPEC-0300-0010 R-20, R-41: the keymap module's default matches the
    // schema type's own Default impl (single source of truth for defaults).
    #[test]
    fn default_keymap_config_matches_schema_default() {
        let from_keymap_module = default_keymap_config();
        let from_schema_default = KeymapConfig::default();
        assert_eq!(from_keymap_module, from_schema_default);
        assert_eq!(from_keymap_module.profile, KeymapProfile::Windows);
        assert!(from_keymap_module.custom.is_empty());
    }
}
