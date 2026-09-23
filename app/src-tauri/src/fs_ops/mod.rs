//! `fs_ops/` (SPEC-0300-0011: ファイル操作 詳細仕様 — copy / move / delete /
//! rename / create). Mirrors the feature-module layout used by `fs/` and
//! `keymap/` (docs/architecture/proposals/SPEC-0200-0001.md §3/§4.2):
//! `fs_ops/` depends only on `shared/`, never on another `<feature>/`.
//!
//! **unit-test-writer note (TDD, 2026-09-23):** every submodule below
//! currently contains *only* `#[cfg(test)] mod tests { ... }` blocks that
//! reference the planned public API (functions/types named in the doc
//! comments and test bodies) — none of that API exists yet. This is
//! intentional: per the unit-test-writer role, implementation code is
//! code-generator's responsibility. `cargo test` for this crate is expected
//! to fail to *compile* until code-generator adds the real
//! `pub fn`/`pub struct`/`pub enum` items these tests call into (the Rust
//! equivalent of vitest's "Cannot find module" for the sibling frontend
//! tests). See `docs/architecture/traceability.md` for the current
//! (expected-red) run result.
//!
//! Submodule responsibilities (SPEC-0300-0011):
//! - `name_validation` — §8/§9 shared name validation (R-62/R-62-1)
//! - `preflight` — §4/§8/§9 preflight checks for transfer/rename/create (R-24, R-36, R-73~R-75)
//! - `transfer` — §4/§5/§10 copy/move batch execution, conflict handling, R-23 fallback fix (R-20~R-36, R-80, R-86)
//! - `delete` — §7 trash-bin delete and permanent delete (R-50~R-58)
//! - `rename` — §8 rename command (R-60~R-64)
//! - `create` — §9 create command (R-70~R-78)
//! - `error` — §10 error-code translation fallback / scope-exclusion guard (R-84~R-88)
//!
//! **2026-09-23 (ISS-0052 resolved):** `commands` now also implements
//! R-40~R-45 (copy/move progress events + cancellation) — see
//! `transfer::run_transfer_batch_with_progress` and `commands`'s module doc
//! comment for the design.

pub mod commands;
pub mod create;
pub mod delete;
pub mod error;
pub mod name_validation;
pub mod preflight;
pub mod rename;
pub mod transfer;
