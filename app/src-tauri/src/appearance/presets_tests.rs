//! TDD (unit-test-writer, 2026-10-24): `appearance/presets.rs` -- the six presets, the name matching and the colour slots
//! (SPEC-0300-0023 R-1701 / R-1708 / R-1709 / R-1713 / R-1714; AC-1701 / AC-1706; SPEC-0200-0001 §3.18.3 `presets.rs`, §3.18.15 MUST-3).
//!
//! Contract (module `appearance::presets`; declared in `appearance/mod.rs` as `#[cfg(test)] mod presets_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Preset { Default, Nord, Monokai, Catppuccin, Solarized, Light }
//! impl Preset {
//!     pub const ALL: [Preset; 6];                          // in the order of R-1708 (default, nord, monokai, catppuccin, solarized, light)
//!     pub fn id(self) -> &'static str;                     // "default" | "nord" | "monokai" | "catppuccin" | "solarized" | "light"
//!     /// The 16 values of R-1708 AS WRITTEN (colour names such as "Cyan", or "#RRGGBB"), in the order of `COLOR_KEYS`.
//!     /// They go through `parse_color` when used. `Light`'s `cursor_fg` / `menu_bar_active_fg` are written "#FFFFFF" (R-1709).
//!     pub fn values(self) -> [&'static str; 16];
//! }
//! /// R-1701: ASCII lower case, then `-` `_` and spaces removed.
//! pub fn normalize_preset_name(name: &str) -> String;
//! /// The preset a name stands for (after `normalize_preset_name`; `catppuccinmocha`, `solarized`, `solarizeddark` included); `None` otherwise.
//! pub fn lookup_preset(name: &str) -> Option<Preset>;
//! /// The slot of one of the 16 items (R-1713): `Background` for bg, cursor_bg, status_bar_bg, menu_bar_active_bg. `None` for a name that is not an item.
//! pub fn slot_of(key: &str) -> Option<Slot>;
//! ```
//! The names of the 16 items are NOT written in this module (MUST-3: they live in `shared::schema::appearance_raw::COLOR_KEYS`).

use super::color::{hex, parse_color, Slot};
use super::presets::{lookup_preset, normalize_preset_name, slot_of, Preset};
use super::resolve::resolve;
use super::test_support::{color_of, preset, PRESET_NAMES, RESOLVED};
use crate::shared::schema::appearance_raw::COLOR_KEYS;

/// R-1708, as printed in the specification (order of COLOR_KEYS).
const R1708: [(&str, [&str; 16]); 6] = [
    ("default", ["Reset", "Cyan", "DarkGray", "Black", "Cyan", "Yellow", "Reset", "LightMagenta", "LightGreen", "LightBlue", "White", "DarkGray", "Black", "Cyan", "Cyan", "Yellow"]),
    ("nord", ["#2E3440", "#88C0D0", "#4C566A", "#2E3440", "#8FBCBB", "#81A1C1", "#ECEFF4", "#B48EAD", "#A3BE8C", "#EBCB8B", "#E5E9F0", "#3B4252", "#2E3440", "#88C0D0", "#88C0D0", "#EBCB8B"]),
    ("monokai", ["#272822", "#F92672", "#75715E", "#272822", "#A6E22E", "#FD971F", "#F8F8F2", "#AE81FF", "#A6E22E", "#E6DB74", "#F8F8F2", "#3E3D32", "#272822", "#F92672", "#66D9EF", "#E6DB74"]),
    ("catppuccin", ["#1E1E2E", "#CBA6F7", "#585B70", "#11111B", "#89B4FA", "#F9E2AF", "#CDD6F4", "#F5C2E7", "#A6E3A1", "#FAB387", "#CDD6F4", "#313244", "#11111B", "#CBA6F7", "#89DCEB", "#F9E2AF"]),
    ("solarized", ["#002B36", "#268BD2", "#073642", "#002B36", "#2AA198", "#B58900", "#839496", "#D33682", "#859900", "#CB4B16", "#93A1A1", "#073642", "#002B36", "#268BD2", "#2AA198", "#B58900"]),
    ("light", ["#F5F5F5", "#0066CC", "#B4B4B4", "#FFFFFF", "#0078D7", "#D97706", "#1F2937", "#7C3AED", "#16A34A", "#EA580C", "#374151", "#E5E7EB", "#FFFFFF", "#0078D7", "#0066CC", "#D97706"]),
];

fn squash(s: &str) -> String {
    s.to_ascii_lowercase().replace(['-', '_', ' '], "")
}

// ------------------------------------------------------------------ R-1708: the data

#[test]
fn r1708_there_are_six_presets_in_the_documented_order() {
    assert_eq!(Preset::ALL.len(), 6);
    let ids: Vec<&str> = Preset::ALL.iter().map(|p| p.id()).collect();
    assert_eq!(ids, PRESET_NAMES);
    assert_eq!(COLOR_KEYS.len(), 16);
}

#[test]
fn r1708_every_preset_has_the_values_of_the_table_as_written() {
    for (preset, (name, expected)) in Preset::ALL.iter().zip(R1708) {
        assert_eq!(preset.id(), name);
        let values = preset.values();
        for (i, key) in COLOR_KEYS.iter().enumerate() {
            // colour names may be written `Cyan` / `cyan` / `DarkGray` / `dark_gray`; hex values compare as text without case
            assert_eq!(squash(values[i]), squash(expected[i]), "{name}.{key}: {} vs {}", values[i], expected[i]);
        }
    }
}

// R-1709: the White of `light` is #FFFFFF, written as such (the name `white` would be #DCDFE4).
#[test]
fn r1709_light_writes_its_two_white_items_as_ffffff() {
    let v = Preset::Light.values();
    let at = |key: &str| COLOR_KEYS.iter().position(|k| *k == key).unwrap();
    assert_eq!(v[at("cursor_fg")].to_ascii_lowercase(), "#ffffff");
    assert_eq!(v[at("menu_bar_active_fg")].to_ascii_lowercase(), "#ffffff");
    // the White of `default` (status_bar_fg) goes through the name table (R-1712): #DCDFE4
    assert_eq!(squash(Preset::Default.values()[at("status_bar_fg")]), "white");
}

#[test]
fn every_preset_value_is_something_parse_color_accepts() {
    for preset in Preset::ALL {
        for (i, key) in COLOR_KEYS.iter().enumerate() {
            let slot = slot_of(key).expect("every item has a slot");
            assert!(parse_color(preset.values()[i], slot).is_some(), "{}.{key} = {}", preset.id(), preset.values()[i]);
        }
    }
}

// R-1714 and the resolved tables of the other presets.
#[test]
fn r1714_resolving_each_preset_gives_the_documented_96_colours() {
    for (name, expected) in RESOLVED {
        let a = resolve(&preset(name));
        for (i, key) in COLOR_KEYS.iter().enumerate() {
            assert_eq!(hex(color_of(&a, key)), expected[i], "{name}.{key}");
        }
        assert!(a.problems.is_empty(), "{name}: {:?}", a.problems);
    }
}

#[test]
fn ac1706_light_keeps_ffffff_but_a_colors_white_is_dce4() {
    use super::test_support::{colors_on, resolved_hex};
    let light = preset("light");
    assert_eq!(resolved_hex(&light, "cursor_fg"), "#ffffff");
    assert_eq!(resolved_hex(&light, "menu_bar_active_fg"), "#ffffff");
    let over = colors_on(preset("light"), &[("cursor_fg", "white")]);
    assert_eq!(resolved_hex(&over, "cursor_fg"), "#dcdfe4", "`[colors] cursor_fg = \"white\"` is R-1712's White, not light's #FFFFFF");
}

// ------------------------------------------------------------------ R-1713: the slots

#[test]
fn r1713_the_four_background_items_are_the_background_slot_and_the_rest_the_foreground() {
    let background = ["bg", "cursor_bg", "status_bar_bg", "menu_bar_active_bg"];
    for key in COLOR_KEYS {
        let expected = if background.contains(&key) { Slot::Background } else { Slot::Foreground };
        assert_eq!(slot_of(key), Some(expected), "{key}");
    }
    assert_eq!(slot_of("foo"), None);
    assert_eq!(slot_of(""), None);
}

// ------------------------------------------------------------------ R-1701: names

#[test]
fn r1701_names_are_compared_after_lowercasing_and_removing_dash_underscore_and_blank() {
    assert_eq!(normalize_preset_name("Solarized-Dark"), "solarizeddark");
    assert_eq!(normalize_preset_name("solarized_dark"), "solarizeddark");
    assert_eq!(normalize_preset_name("Catppuccin Mocha"), "catppuccinmocha");
    assert_eq!(normalize_preset_name(" NORD "), "nord");
    assert_eq!(normalize_preset_name("n-o_r d"), "nord");
    assert_eq!(normalize_preset_name(""), "");
}

#[test]
fn ac1701_the_names_of_the_acceptance_criterion() {
    let cases = [
        ("Nord", Preset::Nord), ("solarized-dark", Preset::Solarized), ("Solarized_Dark", Preset::Solarized), ("solarized", Preset::Solarized),
        ("catppuccin-mocha", Preset::Catppuccin), ("LIGHT", Preset::Light), ("default", Preset::Default), ("monokai", Preset::Monokai),
        ("catppuccin", Preset::Catppuccin), ("catppuccinmocha", Preset::Catppuccin), ("solarizeddark", Preset::Solarized), ("Default", Preset::Default),
        (" nord ", Preset::Nord), ("MONOKAI", Preset::Monokai), ("Solarized Dark", Preset::Solarized),
    ];
    for (text, expected) in cases {
        assert_eq!(lookup_preset(text), Some(expected), "{text:?}");
    }
    for preset in Preset::ALL {
        assert_eq!(lookup_preset(preset.id()), Some(preset), "the id of {preset:?} finds itself");
    }
}

#[test]
fn r1703_names_that_are_not_presets_find_nothing() {
    for bad in ["dracula", "", " ", "nordic", "nord2", "solarizedlight", "solarized-light", "monokai-pro", "catppuccin-latte", "ＬＩＧＨＴ", "ｎｏｒｄ", "light\t", "dark", "system"] {
        assert_eq!(lookup_preset(bad), None, "{bad:?} (a wrong name is nord + W-B0 in `resolve`, never a silent `default` like tuif)");
    }
}
