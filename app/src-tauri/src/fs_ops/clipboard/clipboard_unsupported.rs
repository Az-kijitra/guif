//! Non-Windows stand-in (build/test environments only; the product is Windows-only).
//! Everything answers "cannot open", "no files", "sequence unknown" (SPEC-0200-0001 §3.10.2).

use std::time::Duration;

use super::flow::{Access, ClipboardOps, HdropRead};
use super::hdrop::Effect;

pub struct UnsupportedClipboard;

impl UnsupportedClipboard {
    pub fn new(_owner: isize) -> Self {
        UnsupportedClipboard
    }
}

impl ClipboardOps for UnsupportedClipboard {
    fn open(&mut self, _access: Access) -> bool {
        false
    }
    fn close(&mut self) {}
    fn empty(&mut self) -> bool {
        false
    }
    fn set_hdrop(&mut self, _bytes: &[u8]) -> bool {
        false
    }
    fn set_drop_effect(&mut self, _effect: Effect) -> bool {
        false
    }
    fn read_hdrop(&mut self) -> HdropRead {
        HdropRead::Absent
    }
    fn hdrop_available(&mut self) -> bool {
        false
    }
    fn sequence(&mut self) -> u32 {
        0
    }
    fn wait(&mut self, d: Duration) {
        std::thread::sleep(d);
    }
}
