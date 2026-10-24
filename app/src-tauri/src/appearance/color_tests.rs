//! TDD (unit-test-writer, 2026-10-24): `appearance/color.rs` -- the colour grammar of `[colors]`, the names and numbers, and the
//! small colour arithmetic (SPEC-0300-0023 R-1710 / R-1711 / R-1712 / R-1713 / R-1725 / R-1740; AC-1704 / AC-1705 / AC-1706 / AC-1740;
//! SPEC-0200-0001 §3.18.3 `color.rs`).
//!
//! Contract (module `appearance::color`; declared in `appearance/mod.rs` as `#[cfg(test)] mod color_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub struct Rgb(pub u8, pub u8, pub u8);
//! /// Which side of a terminal cell a `Reset` stands for (R-1713): the four `*bg` items are `Background`.
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Slot { Background, Foreground }
//! pub fn parse_color(text: &str, slot: Slot) -> Option<Rgb>;      // never panics, whatever the text
//! pub fn xterm_256(n: u8) -> Rgb;                                  // 0..=15 per R-1712, 16..=231 6x6x6, 232..=255 greys
//! pub fn luminance(c: Rgb) -> f64;                                 // WCAG 2.1 relative luminance
//! pub fn contrast(a: Rgb, b: Rgb) -> f64;                          // (L1 + 0.05) / (L2 + 0.05), symmetric
//! pub fn mix(a_ratio: f64, a: Rgb, b: Rgb) -> Rgb;                 // per channel round(a_ratio * a + (1 - a_ratio) * b)
//! pub fn hex(c: Rgb) -> String;                                    // "#rrggbb", lower case
//! ```

use super::color::{contrast, hex, luminance, mix, parse_color, xterm_256, Rgb, Slot};
use super::test_support::rgb;

fn fg(text: &str) -> Option<Rgb> {
    parse_color(text, Slot::Foreground)
}

fn bg(text: &str) -> Option<Rgb> {
    parse_color(text, Slot::Background)
}

// ------------------------------------------------------------------ R-1710 1: #RRGGBB / #RGB

#[test]
fn r1710_1_hash_rrggbb_and_hash_rgb_any_case_with_surrounding_blanks() {
    assert_eq!(fg("#FF0000"), Some(rgb("#ff0000")));
    assert_eq!(fg("#ff8800"), Some(rgb("#ff8800")));
    assert_eq!(fg("#AbCdEf"), Some(rgb("#abcdef")));
    assert_eq!(fg("#0AF"), Some(rgb("#00aaff")), "each digit twice: #0AF = #00AAFF");
    assert_eq!(fg("#abc"), Some(rgb("#aabbcc")));
    assert_eq!(fg("#FFF"), Some(rgb("#ffffff")));
    assert_eq!(fg("#000"), Some(rgb("#000000")));
    assert_eq!(fg("  #abc  "), Some(rgb("#aabbcc")), "AC-1703: `file = \"  #abc  \"` is #AABBCC");
    assert_eq!(fg("\t#2E3440\r\n"), Some(rgb("#2e3440")), "tabs and line breaks are blanks too");
}

// ------------------------------------------------------------------ R-1711: ASCII hex only, never a panic

#[test]
fn r1711_a_hash_value_needs_exactly_3_or_6_ascii_hex_digits() {
    for bad in ["#", "#1", "#12", "#1234", "#12345", "#1234567", "#12345678", "#GG0000", "#12345G", "#xyz", "# 123", "#12 456", "#-12345", "#+12345", "#+FFFFF"] {
        assert_eq!(fg(bad), None, "{bad:?} must be refused (tuif's from_str_radix would accept a `+` sign; R-1711 does not)");
    }
}

#[test]
fn r1711_full_width_and_other_non_ascii_characters_are_refused_and_never_panic() {
    // AC-1704: "#ＡＢＣ" (3 full-width characters = 9 bytes), "#ＡＢ" (2 = 6 bytes), "#Ａ" (3 bytes), "#１２３" (full-width digits).
    for bad in ["#ＡＢＣ", "#ＡＢ", "#Ａ", "#１２３", "#ＡＢＣＤＥＦ", "#é", "#éé", "#ééé", "#日本語", "#😀", "#😀a", "#a😀", "#12😀", "#1234😀", "#abc😀", "#ab\u{301}c"] {
        assert_eq!(fg(bad), None, "{bad:?}");
        assert_eq!(bg(bad), None, "{bad:?}");
    }
}

#[test]
fn r1711_no_input_makes_parse_color_panic() {
    // Every position of a multi-byte character against the byte lengths 3 and 6 (tuif slices `hex[0..2]` and panics inside a character).
    let pieces = ["a", "é", "日", "😀", "Ａ", "\u{301}", " ", "\0", "\u{7f}"];
    for a in pieces {
        for b in pieces {
            for c in pieces {
                for text in [format!("#{a}{b}{c}"), format!("#{a}{b}{c}{a}{b}{c}"), format!("{a}{b}{c}"), format!("#{a}{b}")] {
                    let _ = fg(&text);
                    let _ = bg(&text);
                }
            }
        }
    }
    let long = format!("#{}", "f".repeat(100_000));
    assert_eq!(fg(&long), None);
    assert_eq!(fg(&"é".repeat(10_000)), None);
}

// ------------------------------------------------------------------ R-1710 2: 256-colour numbers

#[test]
fn r1710_2_numbers_are_ascii_digits_with_an_optional_single_plus_and_a_u8_value() {
    assert_eq!(fg("0"), Some(rgb("#282C34")));
    assert_eq!(fg("15"), Some(rgb("#DCDFE4")));
    assert_eq!(fg("16"), Some(rgb("#000000")));
    assert_eq!(fg("196"), Some(rgb("#FF0000")));
    assert_eq!(fg("231"), Some(rgb("#FFFFFF")));
    assert_eq!(fg("232"), Some(rgb("#080808")));
    assert_eq!(fg("255"), Some(rgb("#EEEEEE")));
    assert_eq!(fg("007"), Some(rgb("#DCDFE4")), "a leading 0 is allowed: 007 = 7");
    assert_eq!(fg("+5"), Some(rgb("#C678DD")), "`+5` = 5 (tuif reads a u8)");
    assert_eq!(fg("+0"), Some(rgb("#282C34")));
    assert_eq!(fg("0255"), Some(rgb("#EEEEEE")), "leading zeros do not count against the value");
    assert_eq!(fg(" 7 "), Some(rgb("#DCDFE4")), "blanks around are removed first");
}

#[test]
fn r1710_2_numbers_out_of_range_signed_or_not_plain_ascii_digits_are_refused() {
    for bad in ["-1", "-0", "256", "999", "0256", "", "+", "++5", "+-5", "5 5", "5.0", "1e2", "0x10", "0b1", "١٢", "１２", "٣", "７", "5\u{0}", "²"] {
        assert_eq!(fg(bad), None, "{bad:?}");
    }
}

// ------------------------------------------------------------------ R-1710 3 / R-1712: names

#[test]
fn r1712_the_sixteen_names_have_the_one_half_dark_values() {
    let table: [(&str, &str); 16] = [
        ("black", "#282C34"), ("red", "#E06C75"), ("green", "#658251"), ("yellow", "#E5C07B"), ("blue", "#61AFEF"), ("magenta", "#C678DD"),
        ("cyan", "#56B6C2"), ("gray", "#DCDFE4"), ("dark_gray", "#5A6374"), ("light_red", "#E06C75"), ("light_green", "#98C379"),
        ("light_yellow", "#E5C07B"), ("light_blue", "#61AFEF"), ("light_magenta", "#C678DD"), ("light_cyan", "#56B6C2"), ("white", "#DCDFE4"),
    ];
    for (name, value) in table {
        assert_eq!(fg(name), Some(rgb(value)), "{name}");
        assert_eq!(bg(name), Some(rgb(value)), "{name} is not affected by the slot");
    }
}

#[test]
fn r1712_numbers_0_to_15_are_the_same_table_as_the_names() {
    let names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "gray", "dark_gray", "light_red", "light_green", "light_yellow", "light_blue", "light_magenta", "light_cyan", "white"];
    for (i, name) in names.iter().enumerate() {
        assert_eq!(fg(&i.to_string()), fg(name), "number {i} = {name}");
        assert_eq!(xterm_256(i as u8), fg(name).unwrap(), "xterm_256({i})");
    }
}

#[test]
fn r1710_3_aliases_case_and_separators() {
    let same: [(&str, &str); 22] = [
        ("purple", "magenta"), ("grey", "gray"), ("dark_grey", "dark_gray"), ("darkgray", "dark_gray"), ("darkgrey", "dark_gray"),
        ("lightred", "light_red"), ("lightgreen", "light_green"), ("lightyellow", "light_yellow"), ("lightblue", "light_blue"),
        ("lightmagenta", "light_magenta"), ("light_purple", "light_magenta"), ("lightpurple", "light_magenta"), ("lightcyan", "light_cyan"),
        ("LightRed", "light_red"), ("light red", "light_red"), ("Light-Red", "light_red"), ("DARK-GREY", "dark_gray"), ("Dark Gray", "dark_gray"),
        ("  Cyan  ", "cyan"), ("WHITE", "white"), ("Light_Magenta", "light_magenta"), ("light-purple", "light_magenta"),
    ];
    for (alias, name) in same {
        assert!(fg(name).is_some(), "sanity {name}");
        assert_eq!(fg(alias), fg(name), "`{alias}` is `{name}`");
    }
}

#[test]
fn r1710_names_outside_the_list_are_refused() {
    for bad in ["teal", "orange", "pink", "brown", "navy", "rgb(1,2,3)", "rgba(1,2,3,1)", "hsl(0,0%,0%)", "#teal", "lightgrey2", "light", "dark", "red green", "", "   "] {
        assert_eq!(fg(bad), None, "CSS names and functions are not accepted (tuif): {bad:?}");
    }
}

// ------------------------------------------------------------------ R-1713: Reset

#[test]
fn r1713_reset_is_black_in_a_background_item_and_the_terminal_text_colour_elsewhere() {
    for word in ["reset", "default", "none", "Reset", "NONE", "Default", " reset "] {
        assert_eq!(bg(word), Some(rgb("#000000")), "{word:?} as a background");
        assert_eq!(fg(word), Some(rgb("#DCDFE4")), "{word:?} as a foreground");
    }
}

// ------------------------------------------------------------------ AC-1705 as one table

#[test]
fn ac1705_the_numbers_and_names_of_the_acceptance_criterion() {
    let cases: [(&str, Option<&str>); 15] = [
        ("0", Some("#282C34")), ("15", Some("#DCDFE4")), ("16", Some("#000000")), ("196", Some("#FF0000")), ("231", Some("#FFFFFF")),
        ("232", Some("#080808")), ("255", Some("#EEEEEE")), ("007", Some("#DCDFE4")), ("+5", Some("#C678DD")), ("-1", None),
        ("dark-grey", Some("#5A6374")), ("Light Magenta", Some("#C678DD")), ("LightRed", Some("#E06C75")), ("lightcyan", Some("#56B6C2")),
        ("purple", Some("#C678DD")),
    ];
    for (text, expected) in cases {
        assert_eq!(fg(text), expected.map(rgb), "{text:?}");
    }
}

// ------------------------------------------------------------------ xterm 256 (16..=255)

#[test]
fn r1712_numbers_16_to_231_are_the_6x6x6_cube() {
    const LEVELS: [u8; 6] = [0, 95, 135, 175, 215, 255];
    for n in 16u16..=231 {
        let i = (n - 16) as usize;
        let expected = Rgb(LEVELS[i / 36], LEVELS[(i / 6) % 6], LEVELS[i % 6]);
        assert_eq!(xterm_256(n as u8), expected, "xterm_256({n})");
        assert_eq!(fg(&n.to_string()), Some(expected), "parse_color(\"{n}\")");
    }
    assert_eq!(xterm_256(21), rgb("#0000ff"));
    assert_eq!(xterm_256(46), rgb("#00ff00"));
    assert_eq!(xterm_256(196), rgb("#ff0000"));
    assert_eq!(xterm_256(231), rgb("#ffffff"));
}

#[test]
fn r1712_numbers_232_to_255_are_greys_8_plus_10n() {
    for n in 232u16..=255 {
        let v = 8 + 10 * (n - 232) as u8;
        assert_eq!(xterm_256(n as u8), Rgb(v, v, v), "xterm_256({n})");
    }
    assert_eq!(xterm_256(244), rgb("#808080"));
}

// ------------------------------------------------------------------ colour arithmetic

#[test]
fn hex_is_lower_case_with_a_hash_and_six_digits() {
    assert_eq!(hex(Rgb(0x2e, 0x34, 0x40)), "#2e3440");
    assert_eq!(hex(Rgb(0, 0, 0)), "#000000");
    assert_eq!(hex(Rgb(255, 255, 255)), "#ffffff");
    assert_eq!(hex(Rgb(1, 2, 3)), "#010203");
    assert_eq!(hex(Rgb(0xAB, 0xCD, 0xEF)), "#abcdef");
}

#[test]
fn luminance_and_contrast_follow_wcag_2_1() {
    assert!((luminance(rgb("#ffffff")) - 1.0).abs() < 1e-9);
    assert!(luminance(rgb("#000000")).abs() < 1e-9);
    assert!((contrast(rgb("#000000"), rgb("#ffffff")) - 21.0).abs() < 1e-6);
    assert!((contrast(rgb("#ffffff"), rgb("#000000")) - 21.0).abs() < 1e-6, "symmetric");
    assert!((contrast(rgb("#336699"), rgb("#336699")) - 1.0).abs() < 1e-9);
    // AC-1740: #777777 against white 4.478, against black 4.689.
    assert!((contrast(rgb("#777777"), rgb("#ffffff")) - 4.478).abs() < 0.005);
    assert!((contrast(rgb("#777777"), rgb("#000000")) - 4.689).abs() < 0.005);
    // a few known values used by contrast_tests (nord: file on bg 10.84; light: border_inactive on bg 1.90)
    assert!((contrast(rgb("#eceff4"), rgb("#2e3440")) - 10.84).abs() < 0.01);
    assert!((contrast(rgb("#b4b4b4"), rgb("#f5f5f5")) - 1.90).abs() < 0.01);
}

#[test]
fn mix_is_the_per_channel_rounded_weighted_mean() {
    let (a, b) = (rgb("#ffffff"), rgb("#000000"));
    assert_eq!(mix(1.0, a, b), a);
    assert_eq!(mix(0.0, a, b), b);
    assert_eq!(mix(0.5, b, a), rgb("#808080"), "127.5 rounds up (half away from zero)");
    assert_eq!(mix(0.5, a, b), rgb("#808080"));
    // R-1725 1 for nord: file #ECEFF4 and bg #2E3440 at 7:3 = #B3B7BE.
    let m = mix(0.7, rgb("#eceff4"), rgb("#2e3440"));
    for (got, want) in [(m.0, 0xb3u8), (m.1, 0xb7), (m.2, 0xbe)] {
        assert!(got.abs_diff(want) <= 1, "{m:?} vs #b3b7be");
    }
    // R-1725 5 for nord at 5:5: #8D929A.
    assert_eq!(mix(0.5, rgb("#eceff4"), rgb("#2e3440")), rgb("#8d929a"));
}
