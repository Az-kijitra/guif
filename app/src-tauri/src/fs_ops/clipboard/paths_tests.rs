//! TDD (unit-test-writer, Phase 11, 2026-10-03): R-15-5 / R-15-6 path adoption.
//! Specs: SPEC-0300-0011 R-15-5, R-15-6, CB-02, CB-04, CB-05, AC-06-7;
//! SPEC-0300-0016 R-722 / R-795-2 / AC-752 (same acceptance table as the
//! TypeScript `path-bar/normalize.ts`); SPEC-0200-0001 §3.10.7, §3.10.14 G-7 / G-9.

use super::paths::{adopt_paths, is_adoptable, MAX_PATH_UTF16};

const GUID: &str = "12345678-1234-1234-1234-123456789abc";

fn v(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

// AC-06-7: the design's input list, verbatim (GUID filled in).
#[test]
fn ac06_7_the_design_input_list_yields_exactly_the_expected_paths_in_order() {
    let vol_q = format!(r"\\?\Volume{{{GUID}}}\d");
    let vol_d = format!(r"\\.\Volume{{{GUID}}}\i");
    let input = vec![
        r"C:\x\a.txt".to_string(),
        r"rel\b.txt".to_string(),
        "C:rel".to_string(),
        r"\root\c".to_string(),
        r"\\.\PhysicalDrive0".to_string(),
        r"\\.\pipe\p".to_string(),
        vol_q.clone(),
        r"\\?\C:\x\e".to_string(),
        r"\\server\share\f".to_string(),
        r"\\?\UNC\server\share\g".to_string(),
        r"\\.\C:\x\h".to_string(),
        vol_d.clone(),
        r"C:\X\A.TXT".to_string(),
        r"C:\x\dir".to_string(),
        String::new(),
    ];
    let expected = vec![
        r"C:\x\a.txt".to_string(),
        vol_q,
        r"\\?\C:\x\e".to_string(),
        r"\\server\share\f".to_string(),
        r"\\?\UNC\server\share\g".to_string(),
        r"\\.\C:\x\h".to_string(),
        vol_d,
        r"C:\x\dir".to_string(),
    ];
    assert_eq!(adopt_paths(input), expected);
}

// ---- accepted forms (R-15-5 "採用する形")
#[test]
fn accepts_drive_unc_extended_and_device_namespace_forms() {
    for p in [
        r"C:\x".to_string(),
        r"z:\dir\file.txt".to_string(),
        r"\\server\share\f".to_string(),
        r"\\?\C:\x".to_string(),
        r"\\?\UNC\server\share\x".to_string(),
        format!(r"\\?\Volume{{{GUID}}}\x"),
        r"\\.\C:\x".to_string(),
        format!(r"\\.\Volume{{{GUID}}}\x"),
    ] {
        assert!(is_adoptable(&p), "must adopt {p}");
    }
}

// L-14: a drive root is adoptable.
#[test]
fn a_drive_root_is_adopted() {
    assert!(is_adoptable(r"C:\"));
    assert!(is_adoptable(r"D:\"));
}

// ---- rejected forms
#[test]
fn rejects_relative_drive_relative_root_relative_and_empty() {
    for p in ["", "a.txt", r"rel\b.txt", "C:rel", "C:", r"\root\c", r"\x", ".", ".."] {
        assert!(!is_adoptable(p), "must reject {p:?}");
    }
}

// SPEC-0300-0016 R-795-2: device-opening `\\.\` forms are rejected.
#[test]
fn rejects_device_opening_forms_and_a_drive_without_trailing_backslash() {
    for p in [r"\\.\PhysicalDrive0", r"\\.\pipe\p", r"\\.\COM1", r"\\.\C:", r"\\.\", r"\\.\NUL"] {
        assert!(!is_adoptable(p), "must reject {p}");
    }
}

// G-9: only ASCII letters are drive letters.
#[test]
fn drive_letters_are_ascii_only() {
    for p in [r"ｃ:\x", r"1:\x", r"é:\x", r":\x", r"_:\x"] {
        assert!(!is_adoptable(p), "must reject {p}");
    }
    assert!(is_adoptable(r"c:\x") && is_adoptable(r"Z:\x"));
}

// ---- length (UTF-16 units)
#[test]
fn exactly_32767_utf16_units_is_adopted_and_32768_is_not() {
    assert_eq!(MAX_PATH_UTF16, 32_767);
    let ok = format!(r"C:\{}", "a".repeat(32_767 - 3));
    let over = format!(r"C:\{}", "a".repeat(32_768 - 3));
    assert_eq!(utf16_len(&ok), 32_767);
    assert_eq!(utf16_len(&over), 32_768);
    assert!(is_adoptable(&ok));
    assert!(!is_adoptable(&over));
}

// A surrogate pair counts as 2 units (not 1 char, not 4 bytes).
#[test]
fn surrogate_pairs_count_as_two_utf16_units() {
    let emoji = "😀"; // U+1F600 = 2 units
    let exact = format!(r"C:\{}", emoji.repeat((32_767 - 3) / 2)); // 3 + 16382 = 32767 units
    assert_eq!(utf16_len(&exact), 32_767);
    assert!(is_adoptable(&exact));
    let over = format!("{exact}a");
    assert_eq!(utf16_len(&over), 32_768);
    assert!(!is_adoptable(&over));
    // by `chars().count()` this would still look short
    assert!(over.chars().count() < 32_767);
}

// ---- duplicates (CB-04, G-7)
#[test]
fn duplicates_differing_only_in_case_keep_the_first_one_unchanged() {
    assert_eq!(adopt_paths(v(&[r"C:\Dir\File.TXT", r"C:\dir\file.txt", r"C:\DIR\FILE.TXT"])), v(&[r"C:\Dir\File.TXT"]));
    assert_eq!(adopt_paths(v(&[r"C:\dir\file.txt", r"C:\Dir\File.TXT"])), v(&[r"C:\dir\file.txt"]));
}

#[test]
fn duplicates_use_str_to_lowercase_as_the_key() {
    assert_eq!(adopt_paths(v(&[r"C:\Ä", r"C:\ä"])), v(&[r"C:\Ä"]));
    assert_eq!(adopt_paths(v(&[r"C:\ÀÉ", r"C:\àé"])), v(&[r"C:\ÀÉ"]));
}

// `\\?\C:\x` and `C:\x` are different strings and are NOT unified (CB-05: no normalisation).
#[test]
fn extended_prefix_and_plain_form_are_distinct_and_unchanged() {
    let out = adopt_paths(v(&[r"\\?\C:\x", r"C:\x"]));
    assert_eq!(out, v(&[r"\\?\C:\x", r"C:\x"]));
}

#[test]
fn order_is_preserved_and_strings_are_not_converted() {
    let input = v(&[r"D:\b", r"C:\a", r"\\?\UNC\S\s\z", r"\\Server\Share\Q"]);
    assert_eq!(adopt_paths(input.clone()), input);
}

#[test]
fn no_upper_limit_on_the_count() {
    let many: Vec<String> = (0..20_000).map(|i| format!(r"C:\f\{i}.txt")).collect();
    assert_eq!(adopt_paths(many.clone()), many);
}

#[test]
fn nothing_adoptable_gives_an_empty_list() {
    assert!(adopt_paths(vec![]).is_empty());
    assert!(adopt_paths(v(&["", "rel", r"\\.\PhysicalDrive0", "C:x"])).is_empty());
}

// ---- AC-752 representative values (the TS side `normalize.test.ts` holds the same table)
#[test]
fn ac752_representative_values_match_the_typescript_acceptance_table() {
    let accepted = [
        r"C:\".to_string(),
        r"\\server\share".to_string() + r"\x",
        format!(r"\\?\Volume{{{GUID}}}\"),
        format!(r"\\.\Volume{{{GUID}}}\"),
        r"\\.\C:\x".to_string(),
    ];
    for p in &accepted {
        assert!(is_adoptable(p), "accept {p}");
    }
    for p in [r"\\.\PhysicalDrive0", r"\\.\pipe\foo"] {
        assert!(!is_adoptable(p), "reject {p}");
    }
}
