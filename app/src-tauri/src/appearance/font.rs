pub const DEFAULT_FAMILIES: [&str; 7] = ["JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", "Consolas", "BIZ UDGothic", "monospace"];
pub const DEFAULT_FONT_SIZE: u32 = 12;
/// The accepted range of `[font] size` (px).
pub const FONT_SIZE_RANGE: (u32, u32) = (10, 24);
/// `[layout] min_col_width`: (default, min, max).
pub const MIN_COL_WIDTH: (u32, u32, u32) = (24, 10, 80);
/// `[layout] tree_width_percent`: (default, min, max).
pub const TREE_WIDTH_PERCENT: (u32, u32, u32) = (24, 10, 50);

pub fn row_height(size: u32) -> u32 {
    (size as f64 * 1.32).round() as u32
}

pub fn is_bad_name(name: &str) -> bool {
    name.trim().is_empty() || name.chars().any(|c| (c as u32) < 0x20 || c as u32 == 0x7f)
}

/// user names first, then the defaults; duplicates removed without regard to case; the generic stays last.
pub fn merge_families(user: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let push = |name: &str, out: &mut Vec<String>| {
        if !out.iter().any(|o| o.eq_ignore_ascii_case(name)) {
            out.push(name.to_string());
        }
    };
    for u in user {
        if u.eq_ignore_ascii_case("monospace") {
            continue;
        }
        push(u, &mut out);
    }
    for d in DEFAULT_FAMILIES {
        push(d, &mut out);
    }
    out
}

fn quote(name: &str) -> String {
    let mut s = String::from("\"");
    for c in name.chars() {
        match c {
            '"' => s.push_str("\\\""),
            '\\' => s.push_str("\\\\"),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => s.push_str(&format!("\\{:x} ", c as u32)),
            c => s.push(c),
        }
    }
    s.push('"');
    s
}

pub fn css_font_family(families: &[String]) -> String {
    let last = families.len().saturating_sub(1);
    families
        .iter()
        .enumerate()
        .map(|(i, f)| if i == last && f == "monospace" { f.clone() } else { quote(f) })
        .collect::<Vec<_>>()
        .join(", ")
}
