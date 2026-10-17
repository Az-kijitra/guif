//! The product name shown to the user (SPEC-0100-0003 R-02, SPEC-0300-0015 R-423).
//!
//! The one definition on the Rust side: the viewer title `<file name> - <PRODUCT_NAME>` is built from it.
//! It must equal `productName` and the main window `title` in `tauri.conf.json` (checked by
//! `product_tests`), so the main window and the viewer never show different names.

pub const PRODUCT_NAME: &str = "guif";
