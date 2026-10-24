//! TDD (unit-test-writer, 2026-10-24): `appearance/font.rs` and the `[font] family` handling of `resolve` -- the order of the families, what
//! is dropped and reported, and the CSS text that is safe to put into `font-family` (SPEC-0300-0023 R-1750 / R-1751 / R-1753 / R-1754;
//! AC-1750 / AC-1755 / AC-1756; SPEC-0200-0001 §3.18.3 `font.rs`, §3.18.6, §3.18.13 spike S-4, §3.18.15 MUST-1 / MUST-4).
//!
//! Contract (module `appearance::font`; declared as `#[cfg(test)] mod font_tests;`):
//!
//! ```ignore
//! pub const DEFAULT_FAMILIES: [&str; 7];   // "JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", "Consolas", "BIZ UDGothic", "monospace"
//! pub const DEFAULT_FONT_SIZE: u32;        // 12
//! pub fn row_height(size: u32) -> u32;     // round(size * 1.32)
//! /// Each name as a CSS string: in double quotes, `\` and `"` escaped (control characters as hex escapes, never raw); joined by ", ".
//! /// ONLY a LAST element equal to "monospace" (the generic family, R-1750) is written without quotes. No trailing comma, never empty names.
//! pub fn css_font_family(families: &[String]) -> String;
//! ```
//! `Appearance::font_families` is the user's names first, then `DEFAULT_FAMILIES` (the generic `monospace` stays LAST), duplicates removed
//! without regard to case (the first spelling stays). A user name equal to `monospace` (any case) is the generic itself and is dropped, so
//! the generic can never be pushed to the front.
//!
//! The text of the screen's fallback (`app/src/app.css`: `--ui-font`, `--ui-font-size`, `--list-row-height`) is read here with
//! `include_str!` -- in this test module only (MUST-1: no file reading in the production code of `appearance/`).

use super::font::{css_font_family, row_height, DEFAULT_FAMILIES, DEFAULT_FONT_SIZE};
use super::resolve::resolve;
use super::test_support::{assert_clean, n};
use super::{Appearance, Problem};
use crate::shared::schema::appearance_raw::{RawAppearance, RawFamily, RawField, RawFont, RawSection};

const APP_CSS: &str = include_str!("../../../src/app.css");

fn family(value: RawFamily, line: u32) -> RawAppearance {
    family_field(RawField::Value { value, line: Some(line) })
}

fn family_field(family: RawField<RawFamily>) -> RawAppearance {
    RawAppearance { font: RawSection::Table(RawFont { family, size: RawField::Missing }), ..RawAppearance::default() }
}

fn text(name: &str, line: u32) -> RawAppearance {
    family(RawFamily::Str(name.into()), line)
}

fn list(names: &[&str], line: u32) -> RawAppearance {
    family(RawFamily::List(names.iter().map(|s| s.to_string()).collect()), line)
}

fn css_of(a: &Appearance) -> String {
    css_font_family(&a.font_families)
}

const DEFAULT_CSS: &str = "\"JetBrains Mono\", \"JetBrainsMono NFM\", \"JetBrainsMono NF\", \"Cascadia Mono\", \"Consolas\", \"BIZ UDGothic\", monospace";

fn default_css() -> String {
    css_of(&resolve(&RawAppearance::default()))
}

// ------------------------------------------------------------------ R-1750: the default order

#[test]
fn r1750_the_default_order_is_the_seven_of_the_specification() {
    assert_eq!(DEFAULT_FAMILIES, ["JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", "Consolas", "BIZ UDGothic", "monospace"]);
    let a = resolve(&RawAppearance::default());
    assert_eq!(a.font_families, DEFAULT_FAMILIES.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    assert_eq!(css_of(&a), DEFAULT_CSS);
    assert_eq!(DEFAULT_FONT_SIZE, 12);
    assert_eq!(row_height(DEFAULT_FONT_SIZE), 16);
}

#[test]
fn r1750_the_name_of_the_windows_terminal_setting_is_not_in_the_order() {
    assert!(!DEFAULT_FAMILIES.iter().any(|f| f.contains("Nerd Font")), "`JetBrainsMono Nerd Font` is not a Windows family name (§0.8)");
}

// ------------------------------------------------------------------ AC-1750: what the user writes goes first

#[test]
fn ac1750_ii_a_family_goes_before_the_default_order() {
    let a = resolve(&text("Ricty Diminished", 3));
    assert_eq!(css_of(&a), format!("\"Ricty Diminished\", {DEFAULT_CSS}"));
    assert_clean(&a);
}

#[test]
fn ac1750_iii_an_array_keeps_its_order_before_the_default_order() {
    let a = resolve(&list(&["A", "B"], 3));
    assert_eq!(css_of(&a), format!("\"A\", \"B\", {DEFAULT_CSS}"));
    assert_clean(&a);
}

#[test]
fn ac1750_iv_an_empty_string_and_an_empty_array_are_the_same_as_not_writing_it() {
    for raw in [text("", 3), list(&[], 3), list(&[""], 3), list(&["", ""], 3)] {
        let a = resolve(&raw);
        assert_eq!(css_of(&a), DEFAULT_CSS);
        assert_clean(&a);
    }
}

#[test]
fn an_empty_element_beside_good_ones_is_dropped_silently() {
    let a = resolve(&list(&["A", "", "B"], 3));
    assert_eq!(css_of(&a), format!("\"A\", \"B\", {DEFAULT_CSS}"));
    assert_clean(&a);
}

// R-1831: the template's `# family = "JetBrains Mono"` switched on gives the same as writing nothing.
#[test]
fn r1831_a_name_that_is_already_in_the_default_order_is_not_repeated() {
    assert_eq!(css_of(&resolve(&text("JetBrains Mono", 2))), DEFAULT_CSS);
    assert_eq!(css_of(&resolve(&list(&["JetBrains Mono"], 2))), DEFAULT_CSS);
}

#[test]
fn duplicates_are_removed_without_regard_to_case_and_the_first_spelling_stays() {
    let a = resolve(&text("jetbrains mono", 2));
    assert_eq!(css_of(&a), "\"jetbrains mono\", \"JetBrainsMono NFM\", \"JetBrainsMono NF\", \"Cascadia Mono\", \"Consolas\", \"BIZ UDGothic\", monospace");
    let a = resolve(&list(&["Consolas", "CONSOLAS", "consolas", "X", "x"], 2));
    assert_eq!(
        css_of(&a),
        "\"Consolas\", \"X\", \"JetBrains Mono\", \"JetBrainsMono NFM\", \"JetBrainsMono NF\", \"Cascadia Mono\", \"BIZ UDGothic\", monospace"
    );
}

#[test]
fn the_generic_family_stays_last_even_when_the_user_writes_it() {
    for name in ["monospace", "Monospace", "MONOSPACE"] {
        assert_eq!(css_of(&resolve(&text(name, 2))), DEFAULT_CSS, "{name}");
    }
    let a = resolve(&list(&["A", "monospace", "B"], 2));
    assert_eq!(css_of(&a), format!("\"A\", \"B\", {DEFAULT_CSS}"));
    assert_eq!(a.font_families.last().map(String::as_str), Some("monospace"));
}

#[test]
fn names_with_blanks_and_non_ascii_characters_are_fine() {
    let a = resolve(&list(&["BIZ UDゴシック", "Source Han Code JP", "MS ゴシック"], 2));
    assert_eq!(a.font_families[..3], ["BIZ UDゴシック", "Source Han Code JP", "MS ゴシック"]);
    assert_clean(&a);
}

// ------------------------------------------------------------------ AC-1755: names that could break the CSS

#[test]
fn ac1755_i_to_iv_quotes_semicolons_braces_and_backslashes_stay_inside_one_quoted_name() {
    for name in ["A\"B", "X; color: red", "Y}", "Z\\W", "a') ; b{c}", "}; body { display:none } /*", "x\"; y: \"z", "\\\"", "\\", "\"", "end\\"] {
        let a = resolve(&text(name, 3));
        assert_clean(&a);
        assert_eq!(a.font_families[0], name, "the name is kept as written");
        let css = css_of(&a);
        let names = decode_family_list(&css).unwrap_or_else(|e| panic!("{name:?} gave an invalid font-family value ({e}): {css}"));
        assert_eq!(names[0], name, "{css}");
        assert_eq!(&names[1..], &decode_family_list(DEFAULT_CSS).unwrap()[..], "the default order follows unchanged: {css}");
    }
}

#[test]
fn ac1755_the_literal_texts_of_the_dangerous_names() {
    assert_eq!(css_font_family(&["A\"B".to_string()]), "\"A\\\"B\"");
    assert_eq!(css_font_family(&["Z\\W".to_string()]), "\"Z\\\\W\"");
    assert_eq!(css_font_family(&["X; color: red".to_string()]), "\"X; color: red\"");
    assert_eq!(css_font_family(&["Y}".to_string()]), "\"Y}\"");
    assert_eq!(css_font_family(&["A".to_string(), "monospace".to_string()]), "\"A\", monospace");
    assert_eq!(css_font_family(&["monospace".to_string()]), "monospace");
}

#[test]
fn spike_s4_the_values_that_break_a_declaration_cannot_be_made() {
    // S-4: an unescaped `"`, a trailing comma, a raw line break and an unclosed quote make `font-family: var(--ui-font)` invalid.
    let hostile = [
        "a\"b", "a\\", "a\nb", "a\rb", "a\tb", "a\u{1f}b", "a\u{7f}b", "\"", "\\\"", "\"\"", ",", "a,b", " , ", "!", "a!important", "\u{2028}", "a\u{85}b",
        "😀", "日本語", "'", "a'b", "/* x */", "url(x)", "var(--x)", "monospace, serif",
    ];
    for name in hostile {
        let css = css_font_family(&[name.to_string(), "Consolas".to_string(), "monospace".to_string()]);
        let names = decode_family_list(&css).unwrap_or_else(|e| panic!("{name:?} -> {css:?}: {e}"));
        assert_eq!(names, [name, "Consolas"], "{name:?} -> {css:?}");
        assert!(css.ends_with(", monospace"), "{css:?}");
        assert!(!css.chars().any(|c| (c as u32) < 0x20 || c as u32 == 0x7f), "no raw control character: {css:?}");
        assert!(!css.trim_end().ends_with(','), "no trailing comma: {css:?}");
    }
}

#[test]
fn spike_s4_a_nul_is_never_written_raw() {
    let css = css_font_family(&["a b".to_string(), "monospace".to_string()]);
    assert!(!css.contains(' '), "{css:?}");
    assert!(decode_family_list(&css).is_ok(), "{css:?}");
}

// ------------------------------------------------------------------ AC-1755 (v)(vi): MUST-4, a string family

#[test]
fn ac1755_v_vi_a_string_with_a_control_character_or_only_blanks_is_dropped_whole_with_w_b6() {
    for bad in ["\u{7}", "A\u{7}B", "\u{0}", "a\tb", "a\nb", "a\rb", "\u{1f}", "\u{7f}", "  ", " ", "\u{20}\u{20}\u{20}"] {
        let a = resolve(&text(bad, 4));
        assert_eq!(css_of(&a), DEFAULT_CSS, "{bad:?}");
        assert_eq!(a.problems, vec![Problem::FontFamily { line: Some(4) }], "{bad:?}");
    }
}

#[test]
fn must4_a_family_of_a_wrong_type_is_the_default_font_with_w_b6() {
    // `family = 1`, `family = true`, `family = ["a", 1]` (the reader hands any non-string / non-all-strings value over as `WrongType`)
    let a = resolve(&family_field(RawField::WrongType { line: Some(5) }));
    assert_eq!(css_of(&a), DEFAULT_CSS);
    assert_eq!(a.problems, vec![Problem::FontFamily { line: Some(5) }]);
}

// ------------------------------------------------------------------ AC-1755 (vii) / MUST-4: array elements

#[test]
fn ac1755_vii_a_bad_element_of_an_array_is_dropped_alone_with_w_b9() {
    let a = resolve(&list(&["Good", "Bad\u{1}"], 4));
    assert_eq!(css_of(&a), format!("\"Good\", {DEFAULT_CSS}"));
    assert_eq!(a.problems, vec![Problem::FontFamilyElements { line: Some(4), names: vec!["Bad\u{1}".into()] }], "the name is reported AS WRITTEN (the screen replaces control characters)");
}

#[test]
fn must4_several_bad_elements_are_listed_in_the_order_written() {
    let a = resolve(&list(&["  ", "Good", "x\u{7f}y", "Fine", "\t"], 4));
    assert_eq!(css_of(&a), format!("\"Good\", \"Fine\", {DEFAULT_CSS}"));
    assert_eq!(a.problems, vec![Problem::FontFamilyElements { line: Some(4), names: vec!["  ".into(), "x\u{7f}y".into(), "\t".into()] }]);
}

#[test]
fn must4_when_every_element_is_dropped_the_default_font_is_used_and_only_w_b9_is_reported() {
    for (names, listed) in [(vec!["  "], vec!["  "]), (vec!["", "\u{1}"], vec!["\u{1}"]), (vec!["\u{7}", " "], vec!["\u{7}", " "])] {
        let a = resolve(&list(&names, 4));
        assert_eq!(css_of(&a), DEFAULT_CSS, "{names:?}");
        assert_eq!(a.problems, vec![Problem::FontFamilyElements { line: Some(4), names: listed.into_iter().map(String::from).collect() }], "{names:?}: W-B6 is not reported");
    }
}

#[test]
fn must4_an_empty_element_alone_is_never_reported() {
    let a = resolve(&list(&["", "Good", ""], 4));
    assert_clean(&a);
    assert_eq!(css_of(&a), format!("\"Good\", {DEFAULT_CSS}"));
}

// ------------------------------------------------------------------ AC-1756 / size beside the family

#[test]
fn ac1756_a_family_and_a_size_are_both_used() {
    let raw = RawAppearance { font: RawSection::Table(RawFont { family: RawField::Value { value: RawFamily::Str("Consolas".into()), line: Some(2) }, size: n(20, 4) }), ..RawAppearance::default() };
    let a = resolve(&raw);
    assert_eq!(a.font_size, 20);
    assert_eq!(a.row_height, 26);
    assert!(css_of(&a).starts_with("\"Consolas\", \"JetBrains Mono\""), "{}", css_of(&a));
    assert_clean(&a);
}

// ------------------------------------------------------------------ the fallback text of app.css (MUST-1: not a colour drift test)

/// The value of `--name: ...;` in the first `:root` rule of the style sheet; the test fails when the variable is not there.
fn css_var(css: &str, name: &str) -> String {
    let needle = format!("{name}:");
    let at = css
        .match_indices(&needle)
        .map(|(i, _)| i)
        .find(|&i| i == 0 || !css[..i].chars().next_back().is_some_and(|c| c.is_alphanumeric() || c == '-' || c == '_'))
        .unwrap_or_else(|| panic!("`{name}` is not defined in app.css (it is the failure fallback of the list font, §3.18.6)"));
    let rest = &css[at + needle.len()..];
    let end = rest.find(';').unwrap_or_else(|| panic!("`{name}` has no `;`"));
    rest[..end].split_whitespace().collect::<Vec<_>>().join(" ")
}

fn without_comments(css: &str) -> String {
    let mut out = String::new();
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        rest = rest[start + 2..].find("*/").map_or("", |end| &rest[start + 2 + end + 2..]);
    }
    out.push_str(rest);
    out
}

#[test]
fn s4_app_css_carries_the_same_fallback_font_size_and_row_height_as_the_code() {
    let css = without_comments(APP_CSS);
    assert_eq!(css_var(&css, "--ui-font"), default_css().split_whitespace().collect::<Vec<_>>().join(" "));
    assert_eq!(css_var(&css, "--ui-font-size"), format!("{}px", DEFAULT_FONT_SIZE));
    assert_eq!(css_var(&css, "--list-row-height"), format!("{}px", row_height(DEFAULT_FONT_SIZE)));
    assert_eq!(css_var(&css, "--ui-font-mono"), css_var(&css, "--ui-font"), "SPEC-0200-0001 §3.18.16: both have the [font] stack");
    assert_eq!(css_var(&css, "--ui-line-height"), format!("{}px", row_height(DEFAULT_FONT_SIZE)));
}

#[test]
fn the_list_font_is_defined_once_without_a_light_and_dark_copy() {
    let css = without_comments(APP_CSS);
    assert_eq!(css.matches("--ui-font:").count(), 1, "one definition; the media block is gone (AC-1726)");
}

// ------------------------------------------------------------------ a decoder for the value of `font-family` (the test's own CSS reader)

/// Reads a `font-family` list made of quoted strings (and a bare `monospace` last) and returns the decoded names. Strict: a raw control
/// character, an unescaped quote inside a string, an unclosed string, a trailing comma, an empty item or text after the last item is an error.
fn decode_family_list(css: &str) -> Result<Vec<String>, String> {
    let chars: Vec<char> = css.chars().collect();
    let (mut i, mut names) = (0usize, Vec::new());
    loop {
        while chars.get(i) == Some(&' ') {
            i += 1;
        }
        match chars.get(i) {
            Some('"') => {
                i += 1;
                let mut name = String::new();
                loop {
                    let c = *chars.get(i).ok_or("unclosed string")?;
                    i += 1;
                    match c {
                        '"' => break,
                        '\\' => {
                            let e = *chars.get(i).ok_or("dangling backslash")?;
                            i += 1;
                            if e.is_ascii_hexdigit() {
                                let mut digits = String::from(e);
                                while digits.len() < 6 && chars.get(i).is_some_and(char::is_ascii_hexdigit) {
                                    digits.push(chars[i]);
                                    i += 1;
                                }
                                if matches!(chars.get(i), Some(' ' | '\t' | '\n')) {
                                    i += 1;
                                }
                                name.push(char::from_u32(u32::from_str_radix(&digits, 16).unwrap()).filter(|c| *c != '\0').unwrap_or('\u{fffd}'));
                            } else if e == '\n' {
                                return Err("an escaped line break".into());
                            } else {
                                name.push(e);
                            }
                        }
                        c if (c as u32) < 0x20 || c as u32 == 0x7f => return Err(format!("a raw control character U+{:04X} in a string", c as u32)),
                        c => name.push(c),
                    }
                }
                names.push(name);
            }
            Some(_) if chars[i..].iter().collect::<String>().trim() == "monospace" => return Ok(names),
            Some(c) => return Err(format!("unexpected `{c}` at {i}")),
            None => return Err("empty item or trailing comma".into()),
        }
        while chars.get(i) == Some(&' ') {
            i += 1;
        }
        match chars.get(i) {
            None => return Ok(names),
            Some(',') => i += 1,
            Some(c) => return Err(format!("expected `,` after a name, found `{c}`")),
        }
    }
}

#[test]
fn helper_decode_family_list_accepts_the_good_and_refuses_the_broken() {
    assert_eq!(decode_family_list("\"A\", \"B\\\"C\", monospace").unwrap(), ["A", "B\"C"]);
    assert_eq!(decode_family_list("\"a\\a b\"").unwrap(), ["a\nb"]);
    assert_eq!(decode_family_list("\"Z\\\\W\"").unwrap(), ["Z\\W"]);
    for bad in ["\"A", "\"A\",", "\"A\" \"B\"", "A", "\"A\\", "\"A\nB\"", "\"A\"B\"", "", "\"A\", , \"B\""] {
        assert!(decode_family_list(bad).is_err(), "{bad:?} must be refused by the helper");
    }
}
