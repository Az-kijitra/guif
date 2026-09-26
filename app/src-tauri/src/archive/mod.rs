//! `archive/` (SPEC-0300-0014: ZIP 作成 / 展開 — Phase 5). Feature module of the
//! layout in `docs/architecture/proposals/SPEC-0200-0001.md` §3.4: depends only
//! on `shared/` (never on `fs_ops/`, `fs/`, `config/`, `keymap/`; checked by
//! `boundary_tests`).
//!
//! Implemented by code-generator (2026-09-27) against the TDD tests. Submodules:
//! - `error` — `ArchiveErrorCode`/`ArchiveError`/`ArchiveErrorDto` + classifiers (R-394/R-395)
//! - `path_rules` — entry-name / path rules (R-361, R-363, R-364, R-324)
//! - `entry_name` — entry-name character set (R-347)
//! - `eocd` — EOCD pre-check: multi-disk, L-1 (R-362 #1/#4, R-365)
//! - `extract_plan` — `build_plan`: all pre-validation + conflict detection
//! - `extract` — the extraction run (temp file -> no-replace commit)
//! - `create` — output-path checks + ZIP creation
//! - `temp` — fixed-length temp files with RAII cleanup
//! - `win_fs` — the only `unsafe` (`MoveFileExW`, `GetDiskFreeSpaceExW`)
//! - `central_dir` — own central-directory scan (exact duplicates, AES method 99)
//! - `zip_time` — DOS date/time <-> `SystemTime` (local civil time, UTC fallback)
//! - `progress` — `archive://progress` payload + throttling
//! - `commands` — the five Tauri commands and DTOs

pub mod commands;
pub mod create;
pub mod entry_name;
pub mod eocd;
pub mod error;
pub mod extract;
pub mod extract_plan;
pub mod path_rules;
pub mod progress;
pub mod temp;
pub mod win_fs;
pub mod central_dir;
pub mod zip_time;

// ---- test-only support and tests (TDD) ----
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod zip_fixture;
#[cfg(test)]
mod zip_fixture_tests;
#[cfg(test)]
mod error_tests;
#[cfg(test)]
mod path_rules_tests;
#[cfg(test)]
mod entry_name_tests;
#[cfg(test)]
mod eocd_tests;
#[cfg(test)]
mod temp_tests;
#[cfg(test)]
mod win_fs_tests;
#[cfg(test)]
mod progress_tests;
#[cfg(test)]
mod extract_plan_tests;
#[cfg(test)]
mod extract_tests;
#[cfg(test)]
mod create_tests;
#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod boundary_tests;
#[cfg(test)]
mod cp932_experiment_tests;
