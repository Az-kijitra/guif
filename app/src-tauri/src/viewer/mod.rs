//! `viewer/` (SPEC-0300-0015: ReflexViewer統合 — Phase 6). Feature module of
//! the layout in `docs/architecture/proposals/SPEC-0200-0001.md` §3.5 (as
//! amended by §3.5.12, which takes priority over §3.5.0~§3.5.11 where they
//! conflict): depends only on `shared/` (never on `fs`, `fs_ops`, `config`,
//! `keymap`, `archive` — checked by `boundary_tests`, §3.5.12.1 MUST-73).
//!
//! TDD (unit-test-writer, 2026-09-27): none of the submodules are implemented
//! yet. Each carries a "Planned API (not yet implemented, TDD)" doc comment
//! (same convention as `config/navigation.rs`) with the function signatures
//! the `*_tests.rs` files exercise. Only plain data shapes (structs/enums —
//! not decision logic) are written out today; every function that decides
//! something (classification, encoding, ordering, freshness, clamping,
//! window-caller checks) is left undeclared on purpose, so `cargo test`
//! currently fails to build this crate (E0425/E0599, the same "red" state
//! Phase 2's `fs_ops/` TDD pass produced — see traceability.md 2026-09-23
//! entry). This is expected: code-generator fills the bodies in.
//!
//! Submodules:
//! - `classify` — `ViewerKind` + `decide_kind()` (R-410~R-414): the ONE
//!   implementation used by the filer's open judgment AND by the previous/next
//!   navigation's display-capability check (R-410-2, R-493)
//! - `error` — `ViewerErrorCode`/`ViewerError`/`ViewerErrorDto` (R-440, R-447;
//!   string-compatible with SPEC-0300-0011 R-85's viewer codes, ISS-0128)
//! - `text` — `TextPayload` + text decoding/truncation (R-445, R-450~R-454)
//! - `image` — image size limit (R-444)
//! - `siblings` — previous/next file list construction (R-491, R-491-1~3)
//! - `session` — `ViewerSession` allow-set (R-441), request freshness
//!   (R-409/R-431, §3.5.12.2 MUST-74/81, SHOULD-114) and window-generation
//!   lifecycle (R-421/R-430, §3.5.12.4 MUST-76/82)
//! - `geometry` — window geometry clamp (R-424, R-424-1~424-3)
//! - `os_open` — OS-association launch path validation (R-405-2)
//! - `commands` — the caller-window guard shared by all 7 Tauri commands
//!   (R-432-3, R-432-4, R-405-3)
//!
//! Not modeled as separate pure-logic modules here (they are thin glue over
//! real `tauri::Window`/`AppHandle` objects and are exercised by
//! code-generator's own tests, not unit-test-writer's): `window.rs` (ties
//! `geometry`/`session` to real window events) and `pending.rs` (the single
//! `PendingOpen` slot, whose freshness rule IS covered here via
//! `session::RequestKey`/`is_newer`). This simplification is called out in
//! the handback report as a submodule-count deviation from
//! SPEC-0200-0001.md §3.5.1's file listing.

pub mod classify;
pub mod commands;
pub mod error;
pub mod geometry;
pub mod image;
pub mod os_open;
pub mod pending;
pub mod session;
pub mod siblings;
pub mod text;
pub mod window;

// ---- tests (TDD) ----
#[cfg(test)]
mod boundary_tests;
#[cfg(test)]
mod classify_tests;
#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod error_tests;
#[cfg(test)]
mod geometry_tests;
#[cfg(test)]
mod image_tests;
#[cfg(test)]
mod os_open_tests;
#[cfg(test)]
mod session_tests;
#[cfg(test)]
mod siblings_tests;
#[cfg(test)]
mod text_tests;
