// Prevents an additional console window from appearing on Windows in
// release builds. Do not remove (standard Tauri 2 desktop template).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    guif::run();
}
