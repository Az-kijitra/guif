//! `viewer/session.rs` (SPEC-0300-0015 R-409, R-421, R-430, R-431, R-441,
//! R-441-1~4; SPEC-0200-0001 §3.5.12.2 MUST-74/81/**SHOULD-114** and
//! §3.5.12.4 MUST-76/82). Two independent pure concerns live here:
//!
//! 1. **Request freshness** (`RequestKey`/`is_newer`, R-409/R-431): decides
//!    whether a just-arrived `(epoch, seq)` open/navigate/read result should
//!    overwrite the current session, so a slow earlier request can never
//!    clobber a faster later one.
//! 2. **Window-generation lifecycle** (`GenerationState`/`DestroyedAction`,
//!    R-421/R-430): decides what a `Destroyed` event should do when a new
//!    open request arrived while the window was already closing (MUST-82's
//!    single unified rule, replacing the two contradictory MUST-75/76 drafts).
//!
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! // §3.5.12.2, corrected by the coordinator's SHOULD-114 addendum
//! // (2026-09-27): this is NOT lexicographic (epoch, seq) order. An epoch
//! // change is ALWAYS applied (even if the new epoch is numerically smaller,
//! // e.g. the system clock moved backward) because a different epoch means a
//! // different page lifetime entirely; only within the SAME epoch does a
//! // strictly larger seq decide freshness.
//! //   - current.is_none()                        -> true (first request)
//! //   - incoming.epoch != current.epoch           -> true (epoch changed, always)
//! //   - incoming.epoch == current.epoch           -> incoming.seq > current.seq
//! pub fn is_newer(current: Option<RequestKey>, incoming: RequestKey) -> bool;
//!
//! // R-441(a)(b): `requested` and `session.opened_path`/`session.base_dir`
//! // are assumed ALREADY canonicalized by the caller (R-441-2); this function
//! // does no filesystem I/O.
//! pub fn is_allowed(session: &ViewerSession, requested: &std::path::Path) -> bool;
//!
//! // §3.5.12.4 MUST-82's single rule.
//! pub fn on_close_requested(state: GenerationState) -> GenerationState;
//! pub fn on_open_while_closing(state: GenerationState) -> GenerationState;
//! pub fn on_destroyed(state: GenerationState, destroyed_generation: u64) -> (GenerationState, DestroyedAction);
//! pub fn on_reopen_complete(state: GenerationState) -> GenerationState;
//! ```
//!
//! Tests: `viewer/session_tests.rs`.

use std::path::PathBuf;

/// R-409/R-431/MUST-74/81/SHOULD-114: a request's freshness token. `epoch`
/// increases only when the main webview's page lifetime changes (e.g. a
/// reload); `seq` increases per request within one page lifetime.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RequestKey {
    pub epoch: u64,
    pub seq: u64,
}

/// R-441/R-491/R-492: the single open viewer window's state. `siblings` is
/// the previous/next snapshot (R-492); `generation` ties this session to a
/// specific window incarnation (R-421/R-430).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ViewerSession {
    pub opened_path: PathBuf,
    pub base_dir: PathBuf,
    pub siblings: Vec<PathBuf>,
    pub current_index: usize,
    pub generation: u64,
}

/// §3.5.12.4: window-generation bookkeeping across close/reopen races.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GenerationState {
    pub generation: u64,
    pub closing: bool,
    pub reopen_pending: bool,
}

/// What `on_destroyed` says the caller must do next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DestroyedAction {
    /// Clear the session/pending slot for the destroyed generation; nothing
    /// else to do (R-441-3, R-430's normal case).
    ClearSession,
    /// A new open arrived while closing (MUST-82 rule 2): rebuild the window
    /// for `generation` instead of clearing anything.
    Reopen { generation: u64 },
    /// The event's generation no longer matches the live state (MUST-82 rule
    /// 1): ignore it, so an already-superseded session/pending is not
    /// accidentally wiped.
    NoOp,
}

/// §3.5.12.2/SHOULD-114: NOT lexicographic `(epoch, seq)` order. An epoch
/// change is always applied (even numerically smaller); only within the same
/// epoch does a strictly larger seq decide freshness.
pub fn is_newer(current: Option<RequestKey>, incoming: RequestKey) -> bool {
    match current {
        None => true,
        Some(current) if incoming.epoch != current.epoch => true,
        Some(current) => incoming.seq > current.seq,
    }
}

/// R-441(a)(b): `requested` and the session's paths are assumed already
/// canonicalized by the caller (R-441-2); no filesystem I/O here.
pub fn is_allowed(session: &ViewerSession, requested: &std::path::Path) -> bool {
    if requested == session.opened_path {
        return true;
    }
    requested.parent() == Some(session.base_dir.as_path())
}

/// §3.5.12.4 MUST-82 rule set.
pub fn on_close_requested(state: GenerationState) -> GenerationState {
    GenerationState { closing: true, ..state }
}

pub fn on_open_while_closing(state: GenerationState) -> GenerationState {
    GenerationState { generation: state.generation + 1, reopen_pending: true, closing: state.closing }
}

pub fn on_destroyed(state: GenerationState, destroyed_generation: u64) -> (GenerationState, DestroyedAction) {
    if state.reopen_pending {
        let next = GenerationState { generation: state.generation, closing: state.closing, reopen_pending: false };
        return (next, DestroyedAction::Reopen { generation: state.generation });
    }
    if destroyed_generation == state.generation {
        let next = GenerationState { generation: state.generation, closing: false, reopen_pending: false };
        return (next, DestroyedAction::ClearSession);
    }
    (state, DestroyedAction::NoOp)
}

pub fn on_reopen_complete(state: GenerationState) -> GenerationState {
    GenerationState { closing: false, ..state }
}

/// What `viewer_open` must do with a just-arrived open request, given the
/// CURRENT window-generation state (MUST-82's rule 2, from the open-request
/// side rather than the `Destroyed`-event side already covered by
/// `on_destroyed`). Pure/DI-testable: `viewer::commands`/`viewer::window`
/// call this instead of inlining the `state.closing` branch themselves.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenWhileAction {
    /// No window is currently closing: build/focus/switch generation
    /// `generation` right now (the ordinary R-421 path).
    ProceedNow { generation: u64 },
    /// The live window is already closing (its `Destroyed` has not fired
    /// yet): do NOT build a window now (that would race the OS's own close).
    /// `generation` (g+1) becomes the live generation; the pending
    /// `Destroyed` for the OLD generation will rebuild it instead
    /// (`on_destroyed`'s `Reopen` action, MUST-82 rule 2/3).
    DeferUntilDestroyed { generation: u64 },
}

pub fn decide_open_action(state: GenerationState) -> (GenerationState, OpenWhileAction) {
    if state.closing {
        let next = on_open_while_closing(state);
        (next, OpenWhileAction::DeferUntilDestroyed { generation: next.generation })
    } else {
        (state, OpenWhileAction::ProceedNow { generation: state.generation })
    }
}
