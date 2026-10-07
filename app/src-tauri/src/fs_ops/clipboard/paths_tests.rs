//! TDD (unit-test-writer, Phase 11, 2026-10-03): R-15-5 / R-15-6 path adoption.
//! Specs: SPEC-0300-0011 R-15-5, R-15-6, CB-02, CB-04, CB-05, AC-06-7;
//! SPEC-0300-0016 R-722 / R-795-2 / AC-752 (same acceptance table as the
//! TypeScript `path-bar/normalize.ts`); SPEC-0200-0001 §3.10.7, §3.10.14 G-7 / G-9.

use super::paths::adopt_paths;

const GUID: &str = "12345678-1234-1234-1234-123456789abc";

fn v(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
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

// ---- SPEC-0300-0011 第9版 AC-87 / SPEC-0200-0001 §3.12.2 ----------------------------------------
// `paths.rs` keeps only `adopt_paths`; the judgement is `shared::abs_path::is_absolute_path`
// (the former `is_adoptable` tables live in `shared/abs_path_tests.rs`).

// AC-87: the clipboard adoption (R-15-5) gives exactly the result of the R-89-6 judgement.
#[test]
fn ac87_adopt_paths_keeps_exactly_the_paths_that_is_absolute_path_accepts() {
    use crate::shared::abs_path::is_absolute_path;
    let candidates = v(&[
        r"C:\", r"C:\Users", r"c:\a\", r"C:\a/b", r"\server\share", r"\server\share\", r"\server\share\a",
        r"\?\C:\a", r"\?\UNC\server\share\a", r"\.\C:\a", r"\?\PhysicalDrive0", r"\?\pipe\x", r"\?\C:",
        "", "C:", "C:src", "src", r".\src", "..", r"\foo", "/foo", r"\server", r"\server\", r"\.\PhysicalDrive0",
        r"\.\pipe\x", r"\.\", r"\?\", "C:/foo", r"\.\Volume{abc}\x",
    ]);
    let too_long = format!(r"C:\{}", "a".repeat(32_768 - 3));
    let mut all = candidates;
    all.push(too_long);
    // distinct under to_lowercase(), so de-duplication cannot hide a difference
    let mut seen = std::collections::HashSet::new();
    all.retain(|p| seen.insert(p.to_lowercase()));
    let expected: Vec<String> = all.iter().filter(|p| is_absolute_path(p)).cloned().collect();
    assert!(!expected.is_empty() && expected.len() < all.len());
    assert_eq!(adopt_paths(all), expected);
}
