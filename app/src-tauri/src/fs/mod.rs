pub mod commands;
pub mod query;
pub mod fuzzy;
// SPEC-0300-0016 R-780/R-784/R-785 (Phase 8, drive enumeration): `fs`'s own
// submodule (not a tree-specific command, R-784) so `fs_list_dir` stays
// unmodified. Isolates the `unsafe` GetLogicalDrives call (§3.7.1).
pub mod win_drives;

#[cfg(test)]
mod win_drives_tests;


// SPEC-0200-0001 §3.12.3 #1 (`list_dir_checked`), SPEC-0300-0009 AC-643.
#[cfg(test)]
mod list_dir_checked_tests;
