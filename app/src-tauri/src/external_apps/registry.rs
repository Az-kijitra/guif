//! The registrations, validated once at start-up (SPEC-0300-0021 R-1500 .. R-1506, R-1510, R-1540-1;
//! SPEC-0200-0001 §3.16.2, §3.16.3).
//!
//! `Registry::from_raw` judges the RAW `external_apps` of `config.toml` (`shared::schema::external_apps`): per element, a usable
//! `name`, a `program` that expands and has a valid shape, and `args` / `args_for_file` that parse as templates. It touches
//! neither the file system (the executable's existence is asked at every launch, R-1542) nor the environment (the lookup and
//! the start-up `PATH` are injected by `lib.rs`). The result is immutable and shareable (a Tauri managed state).
//!
//! The key is NOT interpreted here (grammar, fixed keys and overlaps are the front end's job, §3.16.3); `key` is the raw string,
//! `key_invalid` says it was not a string (R-1503-1).

use std::ffi::{OsStr, OsString};

use super::defaults::DEFAULT_APPS;
use super::program::{expand_env, validate_program};
use super::template::parse;
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

/// R-1505: at most this many usable registrations.
pub const MAX_APPS: usize = 20;
/// R-1503 1: a `name` has at most this many characters.
pub const MAX_NAME_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisteredApp {
    /// `Some(1..=4)` for the default four (R-1510-1: only the origin of the display name differs).
    pub default_no: Option<u8>,
    /// `None` for the default four (their names are on the screen).
    pub name: Option<String>,
    /// EXPANDED once at start-up (R-1540-1).
    pub program: String,
    pub args: Vec<String>,
    pub args_for_file: Option<Vec<String>>,
    pub key: Option<String>,
    /// `key` was present but not a string.
    pub key_invalid: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidReason {
    Invalid,
    Limit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidRegistration {
    /// 1-based position in the `config.toml` array.
    pub position: usize,
    /// Only when `name` is a string that is not blank and has no control character.
    pub name: Option<String>,
    pub reason: InvalidReason,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Registry {
    pub apps: Vec<RegisteredApp>,
    pub invalid: Vec<InvalidRegistration>,
    pub type_error: bool,
    path_var: Option<OsString>,
}

/// A `name` that can be shown: a string, not blank, no control character.
fn readable_name(name: &RawValue<String>) -> Option<&str> {
    match name {
        RawValue::Value(s) if !s.trim().is_empty() && !s.chars().any(char::is_control) => Some(s.as_str()),
        _ => None,
    }
}

fn valid_template_list(list: &RawValue<Vec<String>>) -> Option<Option<Vec<String>>> {
    match list {
        RawValue::Missing => Some(None),
        RawValue::WrongType => None,
        RawValue::Value(items) => items.iter().all(|item| parse(item).is_ok()).then(|| Some(items.clone())),
    }
}

/// R-1503: one element, or `None` when it is not usable.
fn validate(raw: &RawExternalApp, env: &dyn Fn(&str) -> Option<OsString>) -> Option<RegisteredApp> {
    let name = readable_name(&raw.name).filter(|n| n.chars().count() <= MAX_NAME_CHARS)?;
    let RawValue::Value(program) = &raw.program else { return None };
    let program = expand_env(program, env).ok()?;
    validate_program(&program).ok()?;
    let args = valid_template_list(&raw.args)?.unwrap_or_default();
    let args_for_file = valid_template_list(&raw.args_for_file)?;
    let (key, key_invalid) = match &raw.key {
        RawValue::Missing => (None, false),
        RawValue::WrongType => (None, true),
        RawValue::Value(s) if s.is_empty() => (None, false),
        RawValue::Value(s) => (Some(s.clone()), false),
    };
    Some(RegisteredApp { default_no: None, name: Some(name.to_string()), program, args, args_for_file, key, key_invalid })
}

/// R-1510: the default four, from the data table. A `program` whose variable is not defined stays as written, so the
/// launch reports it as "not found" instead of the default disappearing.
fn default_apps(env: &dyn Fn(&str) -> Option<OsString>) -> Vec<RegisteredApp> {
    DEFAULT_APPS
        .iter()
        .enumerate()
        .map(|(i, d)| RegisteredApp {
            default_no: Some(i as u8 + 1),
            name: None,
            program: expand_env(d.program, env).unwrap_or_else(|_| d.program.to_string()),
            args: d.args.iter().map(|a| a.to_string()).collect(),
            args_for_file: d.args_for_file.map(|list| list.iter().map(|a| a.to_string()).collect()),
            key: Some(d.key.to_string()),
            key_invalid: false,
        })
        .collect()
}

impl Registry {
    pub fn from_raw(raw: &ExternalAppsRaw, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> Registry {
        let mut registry = Registry { apps: Vec::new(), invalid: Vec::new(), type_error: false, path_var };
        match raw {
            ExternalAppsRaw::Missing => registry.apps = default_apps(env),
            ExternalAppsRaw::WrongType => {
                registry.apps = default_apps(env);
                registry.type_error = true;
            }
            ExternalAppsRaw::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    let position = i + 1;
                    let reportable_name = readable_name(&item.name).map(str::to_string);
                    match validate(item, env) {
                        None => registry.invalid.push(InvalidRegistration { position, name: reportable_name, reason: InvalidReason::Invalid }),
                        Some(_) if registry.apps.len() >= MAX_APPS => {
                            registry.invalid.push(InvalidRegistration { position, name: reportable_name, reason: InvalidReason::Limit })
                        }
                        Some(app) => registry.apps.push(app),
                    }
                }
            }
        }
        registry
    }

    /// The start-up snapshot of `PATH` (R-1542: only the existence of files is asked later).
    pub fn path_var(&self) -> Option<&OsStr> {
        self.path_var.as_deref()
    }
}
