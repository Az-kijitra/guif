//! `program` handling (SPEC-0300-0021 R-1540 / R-1540-1 / R-1541 / R-1542 / R-1544; SPEC-0200-0001 §3.16.2, §3.16.4):
//! the `%NAME%` expansion (start-up, once), the shape check of the expanded value, and `resolve` (every launch).
//!
//! `ResolvedExe` can be built here only (its field is private): the process creation (`launch.rs`) gets nothing but a
//! resolved ABSOLUTE path, never the registration's `program` string (AC-1520-1).
//! The environment is injected (`expand_env`'s `env`) and the start-up `PATH` is a parameter of `resolve`; this module reads
//! neither the environment nor the current folder (MUST-142, SHOULD-215 (c)).

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use super::exists::Probe;
use crate::shared::abs_path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProgramError {
    /// Empty or blank.
    Empty,
    /// R-1540-1 3: `%NAME%` names an undefined variable.
    UndefinedVariable(String),
    /// R-1540 4: not an absolute path and not a bare name.
    NotAPathOrName,
    /// R-1541: the extension is not `.exe`.
    NotExe,
}

fn is_name_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '(' || c == ')'
}

/// R-1540-1: expands `%name%` once, left to right. A `%` that does not form `%name%` stays literal; the expanded value is
/// never scanned again. An undefined variable is an error.
pub fn expand_env(spec: &str, env: &dyn Fn(&str) -> Option<OsString>) -> Result<String, ProgramError> {
    let chars: Vec<char> = spec.chars().collect();
    let mut out = String::with_capacity(spec.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' && chars.get(i + 1).copied().is_some_and(is_name_start) {
            let mut end = i + 1;
            while end < chars.len() && is_name_char(chars[end]) {
                end += 1;
            }
            if chars.get(end) == Some(&'%') {
                let name: String = chars[i + 1..end].iter().collect();
                let value = env(&name).ok_or_else(|| ProgramError::UndefinedVariable(name.clone()))?;
                out.push_str(&value.to_string_lossy());
                i = end + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    Ok(out)
}

/// A bare name has no separator and no drive colon.
fn is_bare_name(text: &str) -> bool {
    !text.is_empty() && !text.contains(['\\', '/', ':'])
}

fn has_exe_extension(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"))
}

/// R-1540 2-4 + R-1541 on the EXPANDED value: Ok for an absolute path or a bare name whose extension is `.exe` (any case)
/// or missing (a bare name; `.exe` is added when it is looked up).
pub fn validate_program(expanded: &str) -> Result<(), ProgramError> {
    if expanded.trim().is_empty() {
        return Err(ProgramError::Empty);
    }
    let path = Path::new(expanded);
    if abs_path::is_absolute_path(expanded) {
        return if has_exe_extension(path) { Ok(()) } else { Err(ProgramError::NotExe) };
    }
    if !is_bare_name(expanded) {
        return Err(ProgramError::NotAPathOrName);
    }
    if path.extension().is_none() || has_exe_extension(path) {
        Ok(())
    } else {
        Err(ProgramError::NotExe)
    }
}

/// The executable that will be started: an absolute path to an existing file, found by `resolve`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedExe {
    path: PathBuf,
}

impl ResolvedExe {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// R-1540 2 / 3: an absolute path is used when `probe` says it is a file; a bare name is searched in the start-up `PATH`
/// (empty and non-absolute elements are skipped, so neither the current folder nor the app folder is ever searched), the first
/// file wins, and `.exe` is added to a name without an extension. Anything else is not looked up at all.
pub fn resolve(program: &str, path_var: Option<&OsStr>, probe: &dyn Fn(&Path) -> Probe) -> Option<ResolvedExe> {
    let is_file = |candidate: &Path| has_exe_extension(candidate) && probe(candidate) == Probe::File;
    if abs_path::is_absolute_path(program) {
        let candidate = PathBuf::from(program);
        return is_file(&candidate).then_some(ResolvedExe { path: candidate });
    }
    if !is_bare_name(program) {
        return None;
    }
    let file_name = if Path::new(program).extension().is_none() { format!("{program}.exe") } else { program.to_string() };
    for element in std::env::split_paths(path_var?) {
        if !abs_path::is_absolute_path_buf(&element) {
            continue;
        }
        let candidate = element.join(&file_name);
        if is_file(&candidate) {
            return Some(ResolvedExe { path: candidate });
        }
    }
    None
}
