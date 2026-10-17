//! `external_apps` of `config.toml` as READ, before any judgement (SPEC-0300-0021 R-1500 / R-1503 / R-1504;
//! SPEC-0200-0001 §3.16.2). Pure data, no logic and no imports: `config/config_toml.rs` fills it, and
//! `external_apps/registry.rs` validates it (`config/` never imports `external_apps/`, §4.2).

/// One field of one `[[external_apps]]` element.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawValue<T> {
    /// The field is absent.
    Missing,
    /// Present but of another TOML type than the field expects.
    WrongType,
    Value(T),
}

/// One `[[external_apps]]` element, fields verbatim. Unknown fields are not carried.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawExternalApp {
    pub name: RawValue<String>,
    pub program: RawValue<String>,
    pub args: RawValue<Vec<String>>,
    pub args_for_file: RawValue<Vec<String>>,
    pub key: RawValue<String>,
}

/// The top-level `external_apps` key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExternalAppsRaw {
    /// The key is absent (also: no file, or the whole file was unreadable).
    Missing,
    /// Present but not an array of tables (a non-table element makes the WHOLE value a type error, Q-1).
    WrongType,
    Array(Vec<RawExternalApp>),
}
