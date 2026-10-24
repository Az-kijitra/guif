use crate::shared::schema::appearance_raw::{BORDER_INACTIVE, CURSOR_BG, CURSOR_FG, MENU_BAR_ACTIVE_BG, MENU_BAR_ACTIVE_FG, STATUS_BAR_BG, STATUS_BAR_FG, TREE_CURRENT, TREE_CURSOR};

use super::color::{contrast, hex, mix, Rgb};
use super::highlight::highlight_colors;
use super::resolve::Appearance;

pub const UI_VAR_NAMES: &[&str] = &[
    "--ui-bg", "--ui-fg", "--ui-surface", "--ui-surface-2", "--ui-surface-3", "--ui-border", "--ui-border-strong", "--ui-border-muted", "--ui-muted",
    "--ui-muted-2", "--ui-hover", "--ui-selected", "--ui-focused", "--ui-row-head", "--ui-link", "--ui-error", "--ui-backdrop", "--ui-shadow-1",
    "--ui-shadow-2", "--ui-border-active", "--ui-cursor-fg", "--ui-cursor-bg", "--ui-folder", "--ui-executable", "--ui-selected-fg", "--ui-status-fg",
    "--ui-status-bg", "--ui-menu-active-fg", "--ui-menu-active-bg", "--ui-tree-current", "--ui-tree-cursor", "--ui-color-scheme",
];

pub const VIEWER_VAR_NAMES: &[&str] = &[
    "--vw-bg", "--vw-fg", "--vw-header-bg", "--vw-header-fg", "--vw-border", "--vw-banner-bg", "--vw-banner-fg", "--vw-muted", "--vw-error", "--vw-lineno",
    "--vw-gutter-bg", "--vw-gutter-border", "--vw-hl-keyword", "--vw-hl-title", "--vw-hl-constant", "--vw-hl-string", "--vw-hl-builtin", "--vw-hl-comment",
    "--vw-hl-name", "--vw-hl-section", "--vw-hl-bullet", "--vw-hl-addition-fg", "--vw-hl-addition-bg", "--vw-hl-deletion-fg", "--vw-hl-deletion-bg",
    "--vw-color-scheme",
];

struct Derived {
    muted: Rgb,
    error: Rgb,
    muted2: Rgb,
}

fn derived(a: &Appearance) -> Derived {
    let g = |k: &str| a.colors.get(k).unwrap();
    let (bg, file) = (g("bg"), g("file"));
    let m = mix(0.7, file, bg);
    let muted = if contrast(m, bg) >= 4.5 { m } else { file };
    let e = if a.dark { Rgb(0xff, 0x8a, 0x80) } else { Rgb(0xb0, 0x00, 0x20) };
    let error = if contrast(e, bg) >= 4.5 { e } else { file };
    let mut k = 50;
    let muted2 = loop {
        let m2 = mix(k as f64 / 100.0, file, bg);
        if contrast(m2, bg) >= 3.0 {
            break m2;
        }
        if k >= 100 {
            break file;
        }
        k += 5;
    };
    Derived { muted, error, muted2 }
}

pub fn ui_vars(a: &Appearance) -> Vec<(&'static str, String)> {
    let g = |k: &str| hex(a.colors.get(k).unwrap());
    let d = derived(a);
    let (s1, s2) = if a.dark { ("rgba(0,0,0,.4)", "rgba(0,0,0,.45)") } else { ("rgba(0,0,0,.12)", "rgba(0,0,0,.14)") };
    let values: Vec<String> = vec![
        g("bg"), g("file"), g("bg"), g("bg"), g(STATUS_BAR_BG), g(BORDER_INACTIVE), hex(d.muted2), g(BORDER_INACTIVE), hex(d.muted), hex(d.muted2),
        g(CURSOR_BG), g(STATUS_BAR_BG), g("border"), g(STATUS_BAR_BG), g(TREE_CURRENT), hex(d.error), "rgba(0,0,0,.35)".into(), s1.into(), s2.into(),
        g("border"), g(CURSOR_FG), g(CURSOR_BG), g("folder"), g("executable"), g("selected"), g(STATUS_BAR_FG), g(STATUS_BAR_BG),
        g(MENU_BAR_ACTIVE_FG), g(MENU_BAR_ACTIVE_BG), g(TREE_CURRENT), g(TREE_CURSOR), if a.dark { "dark" } else { "light" }.into(),
    ];
    UI_VAR_NAMES.iter().copied().zip(values).collect()
}

pub fn viewer_vars(a: &Appearance) -> Vec<(&'static str, String)> {
    let g = |k: &str| hex(a.colors.get(k).unwrap());
    let d = derived(a);
    let (bb, bf) = if a.dark { ("#4a3b00", "#ffd866") } else { ("#fff4ce", "#5c4400") };
    let mut values: Vec<String> = vec![
        g("bg"), g("file"), g(STATUS_BAR_BG), g(STATUS_BAR_FG), g("border"), bb.into(), bf.into(), hex(d.muted), hex(d.error), hex(d.muted), g("bg"), g(BORDER_INACTIVE),
    ];
    values.extend(highlight_colors(a.colors.get("bg").unwrap(), a.dark).into_iter().map(hex));
    values.push(if a.dark { "dark" } else { "light" }.into());
    VIEWER_VAR_NAMES.iter().copied().zip(values).collect()
}
