//! `archive/commands.rs` — the five Tauri commands and their DTOs
//! (SPEC-0300-0014 R-371, R-386, R-387, R-388; SPEC-0200-0001 §3.4.2).
//!
//! Thin wrappers over `create` / `extract` / `extract_plan`; the logic (and
//! its tests) lives there. Registered in `lib.rs` (`generate_handler!`),
//! `build.rs` (`AppManifest::commands`) and `capabilities/default.json`
//! (checked by `acl_consistency.rs`).
//!
//! All commands are `#[tauri::command(async)]` (R-388, the same reason as the
//! `fs_ops_*` commands: a plain sync command would run on the WebView2 main
//! thread and freeze the UI).
//!
//! Error convention (SPEC-0200-0001 §3.4.2): `Err(ArchiveErrorDto)` = the
//! request was rejected before anything was written (this includes a cancel
//! that was requested before the work started, code `canceled`); `Ok` from
//! `archive_extract` = writing started, and `outcome` says how it ended.

use super::create::CreateHooks;
use super::error::ArchiveErrorDto;
use super::extract::{ExtractHooks, ExtractOutcome, ExtractResult, Resolution};
use super::extract_plan::ExtractEnv;
use super::guarded::{check_create_guarded, create_guarded, detect_conflicts_guarded, display, extract_guarded};
use super::progress::{should_emit, ArchiveProgressDto, ProgressEvent, EMIT_INTERVAL};
use crate::shared::cancel::CancelGuard;
use crate::shared::cancel::CancelRegistry;
use serde::Serialize;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

pub use super::progress::PROGRESS_EVENT_NAME;

/// `archive_check_create` result: `{ outputPath, overwriteRequired }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckCreateDto {
    pub output_path: String,
    pub overwrite_required: bool,
}

/// `archive_create` result: `{ outputPath, entries, skippedLinks }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResultDto {
    pub output_path: String,
    pub entries: usize,
    pub skipped_links: usize,
}

/// One conflicting entry: `{ entryPath }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictEntryDto {
    pub entry_path: String,
}

/// `archive_detect_conflicts` result: `{ destination, totalEntries, conflicts }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectConflictsDto {
    pub destination: String,
    pub total_entries: usize,
    pub conflicts: Vec<ConflictEntryDto>,
}

/// `archive_extract` result (R-352): `outcome` is `"completed"`, `"failed"` or
/// `"canceled"`; `error` is `{ code, message, entryPath? }` when not completed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResultDto {
    pub extracted: usize,
    pub skipped: usize,
    pub total: usize,
    pub destination: String,
    pub outcome: String,
    pub error: Option<ArchiveErrorDto>,
}

impl From<ExtractResult> for ExtractResultDto {
    fn from(result: ExtractResult) -> Self {
        let outcome = match result.outcome {
            ExtractOutcome::Completed => "completed",
            ExtractOutcome::Failed => "failed",
            ExtractOutcome::Canceled => "canceled",
        };
        ExtractResultDto {
            extracted: result.extracted,
            skipped: result.skipped,
            total: result.total,
            destination: display(&result.destination),
            outcome: outcome.to_string(),
            error: result.error.map(ArchiveErrorDto::from),
        }
    }
}

/// Wire `resolutions` (`{ "<entryPath>": "overwrite" | "skip" }`) -> typed map.
/// A value other than `overwrite` / `skip` is dropped (= unresolved); keys are
/// kept verbatim (exact match with the `entryPath`s of `archive_detect_conflicts`).
pub(crate) fn resolutions_from_wire(wire: Option<HashMap<String, String>>) -> HashMap<String, Resolution> {
    wire.unwrap_or_default()
        .into_iter()
        .filter_map(|(key, value)| match value.as_str() {
            "overwrite" => Some((key, Resolution::Overwrite)),
            "skip" => Some((key, Resolution::Skip)),
            _ => None,
        })
        .collect()
}

/// `archive_cancel` body: one-line delegation to the SHARED registry
/// (`CancelRegistry::request_cancel`, R-386 / R-387-2).
pub(crate) fn cancel_operation(registry: &CancelRegistry, operation_id: &str) {
    registry.request_cancel(operation_id);
}

/// §3.4.5 / SHOULD-88 progress throttle: the first entry, the last entry and
/// any entry 50 ms after the previous emit are sent at once; a throttled
/// entry is kept as pending and sent from the next cancellation poll (every
/// 64 KiB) once 50 ms have passed, so a huge entry after small ones is shown.
#[derive(Default)]
struct Throttle {
    last_emit: Cell<Option<Instant>>,
    pending: RefCell<Option<(String, usize, usize)>>,
}

impl Throttle {
    fn offer(&self, event: &ProgressEvent, send: &dyn Fn(&str, usize, usize)) {
        let since_last = self.last_emit.get().map(|at| at.elapsed());
        if should_emit(event.index, event.total, since_last) {
            send(event.name, event.index, event.total);
            self.last_emit.set(Some(Instant::now()));
            self.pending.borrow_mut().take();
        } else {
            *self.pending.borrow_mut() = Some((event.name.to_string(), event.index, event.total));
        }
    }

    fn flush_if_due(&self, send: &dyn Fn(&str, usize, usize)) {
        let due = self.last_emit.get().is_none_or(|at| at.elapsed() >= EMIT_INTERVAL);
        if !due {
            return;
        }
        if let Some((name, index, total)) = self.pending.borrow_mut().take() {
            send(&name, index, total);
            self.last_emit.set(Some(Instant::now()));
        }
    }
}

/// R-322-1..R-325: side-effect-free pre-check for the create dialog.
#[tauri::command(async)]
pub fn archive_check_create(
    items: Vec<String>,
    output_path: String,
    base_dir: String,
) -> Result<CheckCreateDto, ArchiveErrorDto> {
    let checked = check_create_guarded(&items, &output_path, &base_dir)?;
    Ok(CheckCreateDto { output_path: display(&checked.output_path), overwrite_required: checked.overwrite_required })
}

/// R-327 / R-328: create the ZIP, emitting `archive://progress`.
#[tauri::command(async)]
pub fn archive_create(
    app: AppHandle,
    cancel_registry: State<CancelRegistry>,
    operation_id: String,
    items: Vec<String>,
    output_path: String,
    base_dir: String,
    overwrite: bool,
) -> Result<CreateResultDto, ArchiveErrorDto> {
    // Registers the id (an early cancel is kept, R-387-2) and unregisters on exit.
    let guard = CancelGuard::new(cancel_registry.inner(), &operation_id);
    let throttle = Throttle::default();
    let send = |name: &str, index: usize, total: usize| {
        let payload = ArchiveProgressDto { operation_id: operation_id.clone(), name: name.to_string(), index, total };
        let _ = app.emit(PROGRESS_EVENT_NAME, payload);
    };
    let on_progress = |event: &ProgressEvent| throttle.offer(event, &send);
    let should_cancel = || {
        throttle.flush_if_due(&send);
        guard.flag().load(Ordering::Relaxed)
    };
    let hooks = CreateHooks { should_cancel: &should_cancel, on_progress: &on_progress, ..CreateHooks::none() };
    let result = create_guarded(&items, &output_path, &base_dir, overwrite, &hooks)?;
    Ok(CreateResultDto {
        output_path: display(&result.output_path),
        entries: result.entries,
        skipped_links: result.skipped_links,
    })
}

/// R-371: validation + conflict detection (spec name `zip_extract_list_conflicts`).
#[tauri::command(async)]
pub fn archive_detect_conflicts(
    zip_path: String,
    destination: String,
    base_dir: String,
) -> Result<DetectConflictsDto, ArchiveErrorDto> {
    let plan = detect_conflicts_guarded(&zip_path, &destination, &base_dir, &ExtractEnv::real())?;
    Ok(DetectConflictsDto {
        destination: display(&plan.destination),
        total_entries: plan.total_entries,
        conflicts: plan.conflicts.into_iter().map(|entry_path| ConflictEntryDto { entry_path }).collect(),
    })
}

/// R-346..R-352: extract, emitting `archive://progress`.
#[tauri::command(async)]
pub fn archive_extract(
    app: AppHandle,
    cancel_registry: State<CancelRegistry>,
    operation_id: String,
    zip_path: String,
    destination: String,
    base_dir: String,
    resolutions: Option<HashMap<String, String>>,
) -> Result<ExtractResultDto, ArchiveErrorDto> {
    // Registers the id (an early cancel is kept, R-387-2) and unregisters on exit.
    let guard = CancelGuard::new(cancel_registry.inner(), &operation_id);
    let throttle = Throttle::default();
    let send = |name: &str, index: usize, total: usize| {
        let payload = ArchiveProgressDto { operation_id: operation_id.clone(), name: name.to_string(), index, total };
        let _ = app.emit(PROGRESS_EVENT_NAME, payload);
    };
    let on_progress = |event: &ProgressEvent| throttle.offer(event, &send);
    let should_cancel = || {
        throttle.flush_if_due(&send);
        guard.flag().load(Ordering::Relaxed)
    };
    let hooks = ExtractHooks { should_cancel: &should_cancel, on_progress: &on_progress, ..ExtractHooks::none() };
    let result = extract_guarded(
        &zip_path,
        &destination,
        &base_dir,
        &ExtractEnv::real(),
        &resolutions_from_wire(resolutions),
        &hooks,
    )?;
    Ok(result.into())
}

/// R-387: cancel by `operation_id` (shared registry, one-line delegation).
#[tauri::command(async)]
pub fn archive_cancel(cancel_registry: State<CancelRegistry>, operation_id: String) {
    cancel_operation(cancel_registry.inner(), &operation_id);
}
