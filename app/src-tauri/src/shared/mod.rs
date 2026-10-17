//! Cross-feature shared parts (SPEC-0200-0001 §2, §3.4.1 / §3.4.14 A).
//!
//! `schema` — persisted schema types (§6.1).
//! `window_theme` — theme helpers for a window passed in by the caller (Phase 12; the only `shared/` file
//! that names `tauri`, SPEC-0200-0001 §3.11.16 SHOULD-181).
//! `cancel` / `identity` — operation-wide parts that both `fs_ops/` and
//! `archive/` must share as a single implementation (Phase 5: moved here from
//! `fs_ops/`; SPEC-0300-0011 R-43-2/R-43-3 / R-37-1, SPEC-0300-0014 R-387 /
//! R-325-1 / R-367-1). `shared/` never `use`s a `<feature>/` module
//! (checked by `archive::boundary_tests`).

pub mod cancel;
pub mod e2e_scope;
pub(crate) mod identity;
pub mod schema;
pub mod window_theme;

// TDD (unit-test-writer, 2026-09-27): Phase 5 tests for the moved parts.
#[cfg(test)]
mod cancel_tests;
#[cfg(test)]
mod identity_tests;

// TDD (unit-test-writer, Phase 11, 2026-10-03): E2E scope tests (SPEC-0400-0001 R-10).
#[cfg(test)]
mod e2e_scope_tests;

// Phase 12 (SPEC-0300-0017): `window_theme` tests (pure mapping, background colour drift against the CSS).
#[cfg(test)]
mod window_theme_tests;

// SPEC-0200-0001 §3.12 (Rust-side absolute-path check, SPEC-0300-0011 R-89): the one judgement.
pub mod abs_path;
#[cfg(test)]
mod abs_path_tests;

// SPEC-0300-0021 R-1584 (TDD, unit-test-writer, 2026-10-17): `check_launch` of the E2E scope.
#[cfg(test)]
mod e2e_scope_launch_tests;
