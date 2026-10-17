//! TDD (unit-test-writer, 2026-10-07): the inner layer of the `viewer_*` commands refuses every
//! non-absolute `path` before touching the file system (canonicalize, content sampling, the OS launch).
//! Specs: SPEC-0300-0015 第6版 R-440 / R-441-6 / R-447, AC-514 / AC-515; SPEC-0300-0011 第9版 R-89-1
//! #15..#18 / R-89-4 / T-09, AC-88; SPEC-0200-0001 §3.12.3 / §3.12.6.
//!
//! The caller-window check (`guard`) runs in the command fn, before this layer, and needs a real
//! `tauri::Window`; it is out of scope here (AC-88 後段). The working directory is never changed:
//! relative paths are random names `zz-abs-path-<unique>`.

use std::cell::Cell;
use std::fs;
use std::path::Path;

use super::error::ViewerErrorDto;
use super::guarded::{classify_guarded, open_viewer_guarded, os_open_guarded, read_image_guarded, read_text_guarded};
use super::session::RequestKey;
use super::window::ViewerRuntime;
use crate::shared::e2e_scope::{set_test_scope, Scope};

const INVALID: &str = "invalid_path";

fn rand_name() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static N: AtomicU32 = AtomicU32::new(0);
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("zz-abs-path-{nanos}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed))
}

fn cwd_drive() -> char {
    let cwd = std::env::current_dir().expect("cwd").to_string_lossy().trim_start_matches(r"\\?\").to_string();
    cwd.chars().next().filter(|c| c.is_ascii_alphabetic()).unwrap_or('C')
}

/// AC-514: `a.txt`-style relative, drive-relative, root-relative and empty (plus a random relative name).
fn bad_forms(rand: &str) -> Vec<String> {
    let d = cwd_drive();
    vec![
        "a.txt".to_string(),
        rand.to_string(),
        format!(".\\{rand}"),
        format!("{d}:a.txt"),
        format!("{d}:{rand}"),
        format!("{d}:"),
        format!(r"\a.txt"),
        format!(r"\{rand}"),
        String::new(),
        format!("{d}:/{rand}"),
    ]
}

struct Debris(String);
impl Drop for Debris {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0).or_else(|_| fs::remove_file(&self.0));
    }
}

fn code_of<T>(result: Result<T, ViewerErrorDto>) -> String {
    match result {
        Ok(_) => "<ok>".to_string(),
        Err(e) => e.code,
    }
}

fn err_of<T>(result: Result<T, ViewerErrorDto>) -> ViewerErrorDto {
    match result {
        Ok(_) => panic!("expected an error"),
        Err(e) => e,
    }
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn key(epoch: u64, seq: u64) -> RequestKey {
    RequestKey { epoch, seq }
}

/// The runtime has no session, no request key, no title and an empty pending slot.
fn assert_pristine(rt: &ViewerRuntime, what: &str) {
    let state = rt.session.lock().unwrap();
    assert!(state.request_key.is_none(), "{what}: request key changed");
    assert!(state.session.is_none(), "{what}: session changed");
    assert!(state.title.is_empty(), "{what}: title changed");
    drop(state);
    assert!(rt.pending.take().is_none(), "{what}: pending slot was filled");
}

// ------------------------------------------------------------------------------------ AC-514 classify

#[test]
fn ac514_classify_with_a_bad_path_is_invalid_path_with_a_message() {
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    for bad in bad_forms(&rand) {
        let e = err_of(classify_guarded(&bad));
        assert_eq!(e.code, INVALID, "{bad:?}");
        assert!(!e.message.is_empty(), "{bad:?}: the message is for display and must not be empty");
    }
    assert!(!Path::new(&rand).exists());
}

// R-440 table unchanged for absolute paths.
#[test]
fn ac514_classify_with_absolute_paths_is_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let txt = dir.path().join("a.txt");
    fs::write(&txt, "hello").unwrap();
    assert_eq!(classify_guarded(&s(&txt)).unwrap(), "text");
    // R-410: a known extension is decided without reading the file, so a missing `.txt` still
    // classifies as text (the missing file surfaces later, at viewer_open). An unknown extension
    // has to be sampled, and a missing one is `not_found`.
    let missing_known = dir.path().join("zz-missing.txt");
    assert_eq!(classify_guarded(&s(&missing_known)).unwrap(), "text");
    let missing_unknown = dir.path().join("zz-missing.zzunknownext");
    assert_eq!(code_of(classify_guarded(&s(&missing_unknown))), "not_found");
}

// ------------------------------------------------------------------------------------ AC-514 open

#[test]
fn ac514_open_with_a_bad_path_is_invalid_path_and_leaves_the_session_and_pending_slot_untouched() {
    let rt = ViewerRuntime::default();
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    for bad in bad_forms(&rand) {
        assert_eq!(code_of(open_viewer_guarded(&rt, &bad, key(1, 1))), INVALID, "{bad:?}");
        assert_pristine(&rt, &format!("{bad:?}"));
    }
    assert!(!Path::new(&rand).exists());
}

#[test]
fn ac514_open_with_an_absolute_file_applies_the_request_and_returns_the_title() {
    let dir = tempfile::tempdir().unwrap();
    let txt = dir.path().join("a.txt");
    fs::write(&txt, "hello").unwrap();
    let rt = ViewerRuntime::default();
    let title = open_viewer_guarded(&rt, &s(&txt), key(1, 1)).expect("absolute path").expect("fresh request is applied");
    assert_eq!(title, "a.txt - guif");
    let state = rt.session.lock().unwrap();
    assert_eq!(state.request_key, Some(key(1, 1)));
    assert!(state.session.is_some());
    drop(state);
    assert!(rt.pending.take().is_some());
}

// §3.12.4: the stale-request exclusion (R-409; touches no file) is judged BEFORE the path -> `Ok(None)`,
// and a bad path from a fresh request does not move the stored key.
#[test]
fn ac514_a_stale_request_is_ignored_before_the_path_is_judged() {
    let dir = tempfile::tempdir().unwrap();
    let txt = dir.path().join("a.txt");
    fs::write(&txt, "hello").unwrap();
    let rt = ViewerRuntime::default();
    open_viewer_guarded(&rt, &s(&txt), key(1, 5)).unwrap().expect("applied");
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    assert!(open_viewer_guarded(&rt, &rand, key(1, 3)).expect("stale: not an error").is_none(), "stale + relative -> Ok(None)");
    assert_eq!(code_of(open_viewer_guarded(&rt, &rand, key(1, 6))), INVALID, "fresh + relative -> invalid_path");
    assert_eq!(rt.session.lock().unwrap().request_key, Some(key(1, 5)), "the refused request did not advance the key");
}

// ------------------------------------------------------------------------------------ AC-514 os_open

#[test]
fn ac514_os_open_with_a_bad_path_is_invalid_path_and_never_launches() {
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    for bad in bad_forms(&rand) {
        let launched = Cell::new(0u32);
        let result = os_open_guarded(&bad, |_| {
            launched.set(launched.get() + 1);
            Ok(())
        });
        assert_eq!(code_of(result), INVALID, "{bad:?}");
        assert_eq!(launched.get(), 0, "{bad:?}: launch must not be called");
    }
}

#[test]
fn ac514_os_open_with_an_absolute_file_launches_once_with_the_resolved_path() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("a.txt");
    fs::write(&file, "x").unwrap();
    let seen = std::cell::RefCell::new(Vec::new());
    os_open_guarded(&s(&file), |p| {
        seen.borrow_mut().push(p.to_path_buf());
        Ok(())
    })
    .expect("launch");
    let seen = seen.into_inner();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0].file_name(), file.file_name());
    assert!(seen[0].is_absolute());
}

#[test]
fn ac514_a_launch_failure_is_reported_as_unknown_and_a_missing_file_is_not_found_without_launching() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("a.txt");
    fs::write(&file, "x").unwrap();
    assert_eq!(code_of(os_open_guarded(&s(&file), |_| Err("no app".into()))), "unknown");
    let launched = Cell::new(false);
    let missing = s(&dir.path().join("zz-missing.txt"));
    let result = os_open_guarded(&missing, |_| {
        launched.set(true);
        Ok(())
    });
    assert_eq!(code_of(result), "not_found");
    assert!(!launched.get());
}

// ------------------------------------------------------------------------------------ AC-515 read_text / read_image

#[test]
fn ac515_read_text_and_read_image_with_a_bad_path_are_invalid_path_even_without_a_session() {
    let rt = ViewerRuntime::default();
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    for bad in bad_forms(&rand) {
        assert_eq!(code_of(read_text_guarded(&rt, &bad)), INVALID, "text {bad:?}");
        assert_eq!(code_of(read_image_guarded(&rt, &bad)), INVALID, "image {bad:?}");
    }
    assert_pristine(&rt, "reads");
}

// "許可集合に入る場合も": a relative name that IS in the allow-set (as a stored sibling / opened path) is still refused,
// not answered with the allowed content nor with `not_found`.
#[test]
fn ac515_a_relative_path_is_refused_even_when_the_allow_set_names_it() {
    use super::session::ViewerSession;
    use std::path::PathBuf;
    let rt = ViewerRuntime::default();
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    {
        let mut state = rt.session.lock().unwrap();
        state.session = Some(ViewerSession {
            opened_path: PathBuf::from(&rand),
            base_dir: PathBuf::new(),
            siblings: vec![PathBuf::from(&rand)],
            current_index: 0,
            generation: 0,
        });
    }
    assert_eq!(code_of(read_text_guarded(&rt, &rand)), INVALID);
    assert_eq!(code_of(read_image_guarded(&rt, &rand)), INVALID);
}

#[test]
fn ac515_absolute_allowed_files_are_read_and_absolute_other_files_are_viewer_path_not_allowed() {
    let dir = tempfile::tempdir().unwrap();
    let other = tempfile::tempdir().unwrap();
    let txt = dir.path().join("a.txt");
    fs::write(&txt, "hello").unwrap();
    let foreign = other.path().join("b.txt");
    fs::write(&foreign, "secret").unwrap();
    let rt = ViewerRuntime::default();
    open_viewer_guarded(&rt, &s(&txt), key(1, 1)).unwrap().expect("applied");
    let payload = read_text_guarded(&rt, &s(&txt)).expect("allowed absolute path");
    assert_eq!(payload.content, "hello");
    assert_eq!(code_of(read_text_guarded(&rt, &s(&foreign))), "viewer_path_not_allowed");
    assert_eq!(code_of(read_image_guarded(&rt, &s(&foreign))), "viewer_path_not_allowed");
}

// ------------------------------------------------------------------------------------ AC-88

// A relative `a.txt` outside the scope: `invalid_path`, NOT `viewer_path_not_allowed` (for os_open) and not a scope code.
#[test]
fn ac88_with_a_scope_active_a_relative_path_is_invalid_path_not_viewer_path_not_allowed() {
    let scope_dir = tempfile::tempdir().unwrap();
    let _scope = set_test_scope(Scope::new(fs::canonicalize(scope_dir.path()).unwrap()));
    let rand = rand_name();
    let _debris = Debris(rand.clone());
    let rt = ViewerRuntime::default();
    let launched = Cell::new(false);
    for bad in ["a.txt".to_string(), rand.clone(), String::new()] {
        let result = os_open_guarded(&bad, |_| {
            launched.set(true);
            Ok(())
        });
        assert_eq!(code_of(result), INVALID, "os_open {bad:?}");
        assert_eq!(code_of(classify_guarded(&bad)), INVALID, "classify {bad:?}");
        assert_eq!(code_of(open_viewer_guarded(&rt, &bad, key(1, 1))), INVALID, "open {bad:?}");
        assert_eq!(code_of(read_text_guarded(&rt, &bad)), INVALID, "read_text {bad:?}");
        assert_eq!(code_of(read_image_guarded(&rt, &bad)), INVALID, "read_image {bad:?}");
    }
    assert!(!launched.get());
}

// Control: the scope really is active -- an ABSOLUTE path is `viewer_path_not_allowed` for os_open (always, R-10-5).
#[test]
fn ac88_control_an_absolute_os_open_is_refused_by_the_scope_without_launching() {
    let scope_dir = tempfile::tempdir().unwrap();
    let _scope = set_test_scope(Scope::new(fs::canonicalize(scope_dir.path()).unwrap()));
    let file = scope_dir.path().join("a.txt");
    fs::write(&file, "x").unwrap();
    let launched = Cell::new(false);
    let result = os_open_guarded(&s(&file), |_| {
        launched.set(true);
        Ok(())
    });
    assert_eq!(code_of(result), "viewer_path_not_allowed");
    assert!(!launched.get());
}
