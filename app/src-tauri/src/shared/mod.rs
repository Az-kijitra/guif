//! Cross-feature shared parts (SPEC-0200-0001 §2, §3.4.1 / §3.4.14 A).
//!
//! `schema` — persisted schema types (§6.1).
//! `cancel` / `identity` — operation-wide parts that both `fs_ops/` and
//! `archive/` must share as a single implementation (Phase 5: moved here from
//! `fs_ops/`; SPEC-0300-0011 R-43-2/R-43-3 / R-37-1, SPEC-0300-0014 R-387 /
//! R-325-1 / R-367-1). `shared/` never `use`s a `<feature>/` module
//! (checked by `archive::boundary_tests`).

pub mod cancel;
pub(crate) mod identity;
pub mod schema;

// TDD (unit-test-writer, 2026-09-27): Phase 5 tests for the moved parts.
#[cfg(test)]
mod cancel_tests;
#[cfg(test)]
mod identity_tests;
