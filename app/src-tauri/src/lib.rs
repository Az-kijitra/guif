//! Crate root (test scaffolding only).
//!
//! Module declarations mirror the feature-module layout approved in
//! `docs/architecture/proposals/SPEC-0200-0001.md` §2/§3:
//! - `fs` (SPEC-0300-0009 query logic)
//! - `keymap` (SPEC-0300-0010 defaults/key-processing logic, no persistence)
//! - `config` (persistence I/O, SPEC-0200-0001 §6)
//! - `shared::schema` (persisted schema types, SPEC-0200-0001 §6.1)
//!
//! Each module file below currently contains *only* unit tests
//! (`#[cfg(test)] mod tests`) written ahead of implementation (TDD). They are
//! expected to fail to compile until code-generator adds the corresponding
//! implementation (the functions/types referenced by `super::*` in each
//! test module).

pub mod config;
pub mod fs;
pub mod keymap;
pub mod shared;
