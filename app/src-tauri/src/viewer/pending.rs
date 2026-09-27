//! `viewer/pending.rs` — the single "pending open" slot handed to a freshly
//! created (or already-open) viewer window (R-430; SPEC-0200-0001 §3.5.12.2).
//! Plain data + a `Mutex`-guarded slot only (no `crate::config`/`fs`/etc.
//! imports, §3.5.12.1 MUST-73). Glue-layer support code (not itself pinned by
//! `unit-test-writer`'s TDD suite; see `viewer/mod.rs`'s note on `window.rs`/
//! `pending.rs`).

use std::sync::Mutex;

/// What the `/viewer` route needs to render the just-opened file (R-430):
/// the canonicalized path, its `ViewerKind` (as a wire string), the
/// previous/next sibling list (R-492, already allow-set-filtered at the
/// listing level) and the opened file's index within it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingOpen {
    pub path: String,
    pub kind: String,
    pub siblings: Vec<String>,
    pub current_index: usize,
}

/// R-430: exactly one slot — a new `viewer_open` always replaces whatever was
/// there (the frontend's `request-sequencer.ts` handles any residual
/// out-of-order-arrival race on the JS side).
#[derive(Default)]
pub struct PendingOpenSlot(pub Mutex<Option<PendingOpen>>);

impl PendingOpenSlot {
    pub fn set(&self, value: PendingOpen) {
        *self.0.lock().expect("pending-open mutex poisoned") = Some(value);
    }

    /// R-430/R-441-3: `viewer_take_pending` consumes the slot; a subsequent
    /// call (e.g. a stray reload) sees `None` until the next `viewer_open`.
    pub fn take(&self) -> Option<PendingOpen> {
        self.0.lock().expect("pending-open mutex poisoned").take()
    }

    /// R-441-3: clears the slot when the viewer window closes.
    pub fn clear(&self) {
        *self.0.lock().expect("pending-open mutex poisoned") = None;
    }
}
