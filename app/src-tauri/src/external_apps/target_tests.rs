//! TDD (unit-test-writer, 2026-10-17): `external_apps/target.rs` -- the target value, `{dir}` of a file (`dir_of`) and the
//! pre-launch check (`verify`).
//! Specs: SPEC-0300-0021 R-1525 (paths are passed as the file list holds them: `\` separators, no `\\?\`, UNC as is; `{dir}` of a
//! file = the path without its last `\` and what follows; a drive-only result `C:` becomes `C:\`; a UNC share root `\\server\share`
//! becomes `\\server\share\`; a folder target is passed as it is, no trailing `\` added or removed), R-1536 + D-05 (before launching:
//! the target exists AND has the same kind as when it was decided; the kind is judged like the file list does, i.e. a junction /
//! symlink by what it points at), AC-1510 (iii)(iv), AC-1516; SPEC-0200-0001 §3.16.2 (`target.rs`), §3.16.15 MINOR-34 (`Path::parent`
//! may be used inside), SHOULD-216 (the three places that judge a kind agree).
//!
//! Contract the implementer must satisfy (module `external_apps::target`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod target_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Kind { File, Dir }
//! #[derive(Debug, Clone, PartialEq, Eq)]      pub struct Target { pub path: String, pub kind: Kind }
//! #[derive(Debug, Clone, PartialEq, Eq)]      pub struct TargetMissing;
//! pub fn dir_of(file_path: &str) -> String;                       // R-1525 (a file's folder)
//! pub fn verify(target: &Target) -> Result<(), TargetMissing>;    // R-1536 (touches the file system)
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use super::target::{dir_of, verify, Kind, Target};

// ------------------------------------------------------------------ dir_of (R-1525, AC-1510)

#[test]
fn dir_of_removes_the_last_separator_and_the_file_name() {
    assert_eq!(dir_of(r"C:\t\d d\a b.txt"), r"C:\t\d d");
    assert_eq!(dir_of(r"C:\a\b\c.txt"), r"C:\a\b");
    assert_eq!(dir_of(r"C:\a\b.txt"), r"C:\a");
    assert_eq!(dir_of(r"D:\日本語\ファイル.txt"), r"D:\日本語");
}

#[test]
fn ac1510_iii_a_file_in_the_drive_root_gives_the_root_with_a_backslash() {
    assert_eq!(dir_of(r"C:\x.txt"), r"C:\");
    assert_eq!(dir_of(r"d:\readme"), r"d:\");
}

#[test]
fn a_file_in_a_verbatim_drive_root_gives_the_root_with_a_backslash() {
    assert_eq!(dir_of(r"\\?\C:\f"), r"\\?\C:\");
    assert_eq!(dir_of(r"\\?\C:\d\f"), r"\\?\C:\d");
}

#[test]
fn ac1510_iv_a_file_in_the_top_of_a_unc_share_gives_the_share_with_a_backslash() {
    assert_eq!(dir_of(r"\\srv\sh\y.txt"), r"\\srv\sh\");
    assert_eq!(dir_of(r"\\server\share\a b.txt"), r"\\server\share\");
}

#[test]
fn a_file_below_the_top_of_a_unc_share_gives_the_plain_folder() {
    assert_eq!(dir_of(r"\\srv\sh\d\y.txt"), r"\\srv\sh\d");
    assert_eq!(dir_of(r"\\srv\sh\d\e\y.txt"), r"\\srv\sh\d\e");
}

#[test]
fn dir_of_leaves_odd_characters_alone() {
    assert_eq!(dir_of(r"C:\a;b&c%d,e(f)\x{y}.txt"), r"C:\a;b&c%d,e(f)");
    assert_eq!(dir_of(r"C:\100% done\x.txt"), r"C:\100% done");
}

// ------------------------------------------------------------------ verify (R-1536, AC-1516)

fn temp() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    // The long-name form WITHOUT the verbatim prefix (R-1525: the paths handed to a program never carry it).
    let canonical = fs::canonicalize(dir.path()).expect("canonicalize");
    let text = canonical.to_string_lossy().to_string();
    let root = PathBuf::from(text.strip_prefix(r"\\?\").filter(|rest| rest.as_bytes().get(1) == Some(&b':')).unwrap_or(&text));
    (dir, root)
}

fn t(path: &Path, kind: Kind) -> Target {
    Target { path: path.to_string_lossy().to_string(), kind }
}

fn dir_link(link: &Path, target: &Path) -> bool {
    std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[test]
fn verify_accepts_an_existing_file_and_an_existing_folder_of_the_expected_kind() {
    let (_d, root) = temp();
    let file = root.join("a b.txt");
    fs::write(&file, "x").unwrap();
    let folder = root.join("sub dir");
    fs::create_dir(&folder).unwrap();
    assert!(verify(&t(&file, Kind::File)).is_ok());
    assert!(verify(&t(&folder, Kind::Dir)).is_ok());
    assert!(verify(&t(&root, Kind::Dir)).is_ok(), "the current folder itself (R-1531)");
}

#[test]
fn ac1516_a_target_that_vanished_is_refused() {
    let (_d, root) = temp();
    let file = root.join("gone.txt");
    fs::write(&file, "x").unwrap();
    assert!(verify(&t(&file, Kind::File)).is_ok());
    fs::remove_file(&file).unwrap();
    assert!(verify(&t(&file, Kind::File)).is_err());
    assert!(verify(&t(&root.join("never-existed"), Kind::Dir)).is_err());
    assert!(verify(&t(&root.join("never-existed").join("deeper"), Kind::File)).is_err());
}

#[test]
fn ac1516_a_file_that_became_a_folder_and_a_folder_that_became_a_file_are_refused() {
    let (_d, root) = temp();
    let p = root.join("swap");
    fs::write(&p, "x").unwrap();
    assert!(verify(&t(&p, Kind::Dir)).is_err(), "decided as a folder, now a file");
    fs::remove_file(&p).unwrap();
    fs::create_dir(&p).unwrap();
    assert!(verify(&t(&p, Kind::File)).is_err(), "decided as a file, now a folder");
    assert!(verify(&t(&p, Kind::Dir)).is_ok());
}

#[test]
fn ac1516_a_junction_to_a_folder_is_a_folder() {
    let (_d, root) = temp();
    let real = root.join("real");
    fs::create_dir(&real).unwrap();
    let link = root.join("link");
    if !dir_link(&link, &real) {
        eprintln!("SKIP: cannot create a junction here (mklink /J failed)");
        return;
    }
    assert!(verify(&t(&link, Kind::Dir)).is_ok(), "D-05: judged by what it points at");
    assert!(verify(&t(&link, Kind::File)).is_err());
    fs::remove_dir(&real).unwrap();
    assert!(verify(&t(&link, Kind::Dir)).is_err(), "the junction's target vanished");
    let _ = fs::remove_dir(&link);
}

#[test]
fn a_path_with_odd_characters_is_checked_as_given() {
    let (_d, root) = temp();
    let odd = root.join("a;b&c %x% ,(1) 日本語.txt");
    fs::write(&odd, "x").unwrap();
    assert!(verify(&t(&odd, Kind::File)).is_ok());
}

// ------------------------------------------------------------------ SHOULD-216: the places that judge a kind agree

/// SPEC-0200-0001 §3.16.15 SHOULD-216 + SPEC-0300-0021 R-1536 / D-05 ("the kind is judged like the file list does; a junction / symlink by what it
/// points at"). The screen sends the `kind` it got from `fs_list_dir`; `verify` must accept exactly that. FOUND BY THE TEST WRITER (2026-10-17, checked
/// on this machine): `fs::query::fs_list_dir` uses `DirEntry::metadata()` (does not follow), and std treats a junction as a symlink, so the list reports a
/// junction to a folder as `File` while `exists::probe` (which follows) says `Dir` -> right-clicking such a row would end in "target not found" (W-96).
/// RED until the list judges a link by its target (fix `fs/query.rs`: follow the link for `entry_type`; a separate issue per SHOULD-216) -- or the
/// specification is changed. `verify` stays "follow" (design §3.16.15).
#[test]
fn the_file_list_and_verify_agree_on_the_kind_of_a_junction_to_a_folder() {
    use crate::fs::query::{fs_list_dir, EntryType};
    let (_d, root) = temp();
    let real = root.join("real");
    fs::create_dir(&real).unwrap();
    fs::write(root.join("plain.txt"), "x").unwrap();
    let link = root.join("link");
    if !dir_link(&link, &real) {
        eprintln!("SKIP: cannot create a junction here (mklink /J failed)");
        return;
    }
    let listing = fs_list_dir(&root, true, "name", "asc").expect("list");
    for (name, path) in [("plain.txt", root.join("plain.txt")), ("real", real.clone()), ("link", link.clone())] {
        let entry = listing.iter().find(|e| e.name == name).unwrap_or_else(|| panic!("{name} is listed"));
        let kind = if matches!(entry.entry_type, EntryType::Dir) { Kind::Dir } else { Kind::File };
        assert!(
            verify(&t(&path, kind)).is_ok(),
            "`{name}`: the list says {:?}, but verify (which follows links) refuses that kind (SHOULD-216)",
            entry.entry_type
        );
    }
    let _ = fs::remove_dir(&link);
}
