use std::collections::BTreeMap;

use crate::shared::schema::appearance_raw::{RawAppearance, RawFamily, RawField, RawFont, RawLayout, RawSection, RawTheme, RawThemeSection, FONT_KEYS, LAYOUT_KEYS, THEME_KEYS};
use crate::shared::schema::config_lines::ConfigLines;

fn line_in(lines: &ConfigLines, table: &str, key: &str) -> Option<u32> {
    lines.tables.get(table).and_then(|m: &BTreeMap<String, u32>| m.get(key)).copied()
}

fn string_field(t: &toml::value::Table, lines: &ConfigLines, table: &str, key: &str) -> RawField<String> {
    let line = line_in(lines, table, key);
    match t.get(key) {
        None => RawField::Missing,
        Some(toml::Value::String(s)) => RawField::Value { value: s.clone(), line },
        Some(_) => RawField::WrongType { line },
    }
}

fn int_field(t: &toml::value::Table, lines: &ConfigLines, table: &str, key: &str) -> RawField<i64> {
    let line = line_in(lines, table, key);
    match t.get(key) {
        None => RawField::Missing,
        Some(toml::Value::Integer(i)) => RawField::Value { value: *i, line },
        Some(_) => RawField::WrongType { line },
    }
}

fn family_field(t: &toml::value::Table, lines: &ConfigLines, key: &str) -> RawField<RawFamily> {
    let line = line_in(lines, "font", key);
    match t.get(key) {
        None => RawField::Missing,
        Some(toml::Value::String(s)) => RawField::Value { value: RawFamily::Str(s.clone()), line },
        Some(toml::Value::Array(items)) => {
            let strings: Option<Vec<String>> = items.iter().map(|v| v.as_str().map(str::to_string)).collect();
            strings.map_or(RawField::WrongType { line }, |v| RawField::Value { value: RawFamily::List(v), line })
        }
        Some(_) => RawField::WrongType { line },
    }
}

pub fn read(table: &toml::value::Table, lines: &ConfigLines) -> RawAppearance {
    let top_line = |k: &str| lines.top.get(k).copied();
    let theme = match table.get("theme") {
        None => RawThemeSection::Missing,
        Some(toml::Value::Table(t)) => RawThemeSection::Table(RawTheme {
            line: top_line("theme"),
            preset: string_field(t, lines, "theme", THEME_KEYS[0]),
            name: string_field(t, lines, "theme", THEME_KEYS[1]),
            theme: string_field(t, lines, "theme", THEME_KEYS[2]),
        }),
        Some(toml::Value::String(s)) => RawThemeSection::Str { value: s.clone(), line: top_line("theme") },
        Some(_) => RawThemeSection::WrongType { line: top_line("theme") },
    };
    let colors = match table.get("colors") {
        None => RawSection::Missing,
        Some(toml::Value::Table(t)) => RawSection::Table(t.keys().map(|k| (k.clone(), string_field(t, lines, "colors", k))).collect()),
        Some(_) => RawSection::NotTable { line: top_line("colors") },
    };
    let font = match table.get("font") {
        None => RawSection::Missing,
        Some(toml::Value::Table(t)) => RawSection::Table(RawFont { family: family_field(t, lines, FONT_KEYS[0]), size: int_field(t, lines, "font", FONT_KEYS[1]) }),
        Some(_) => RawSection::NotTable { line: top_line("font") },
    };
    let layout = match table.get("layout") {
        None => RawSection::Missing,
        Some(toml::Value::Table(t)) => RawSection::Table(RawLayout {
            min_col_width: int_field(t, lines, "layout", LAYOUT_KEYS[0]),
            tree_width_percent: int_field(t, lines, "layout", LAYOUT_KEYS[1]),
        }),
        Some(_) => RawSection::NotTable { line: top_line("layout") },
    };
    RawAppearance { theme, colors, font, layout }
}
