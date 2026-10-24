use super::color::{contrast, parse_color, Rgb};
use super::font::{is_bad_name, merge_families, row_height, DEFAULT_FONT_SIZE, FONT_SIZE_RANGE, MIN_COL_WIDTH, TREE_WIDTH_PERCENT};
use super::presets::{lookup_preset, slot_of, Preset};
use crate::shared::schema::appearance_raw::{
    RawAppearance, RawFamily, RawField, RawSection, RawThemeSection, COLOR_ALIASES, COLOR_KEYS, LAYOUT_KEYS, THEME_KEYS,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Palette(pub [Rgb; 16]);

impl Palette {
    pub fn get(&self, key: &str) -> Option<Rgb> {
        COLOR_KEYS.iter().position(|k| *k == key).map(|i| self.0[i])
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColorItem {
    pub name: String,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnusedItem {
    pub table: String,
    pub name: String,
    pub line: Option<u32>,
    pub used: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Problem {
    PresetUnusable { line: Option<u32>, value: String },
    PresetWrongType { line: Option<u32>, key: String },
    ColorsUnparsable { items: Vec<ColorItem> },
    ColorsNotTable { line: Option<u32> },
    FontSize { line: Option<u32> },
    FontFamily { line: Option<u32> },
    FontFamilyElements { line: Option<u32>, names: Vec<String> },
    NotTable { line: Option<u32>, key: String },
    LayoutValue { line: Option<u32>, key: String },
    Unused { items: Vec<UnusedItem> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Appearance {
    pub colors: Palette,
    pub dark: bool,
    pub font_families: Vec<String>,
    pub font_size: u32,
    pub row_height: u32,
    pub min_col_width: u32,
    pub tree_width_percent: u32,
    pub problems: Vec<Problem>,
}

fn field_line<T>(f: &RawField<T>) -> Option<u32> {
    match f {
        RawField::Missing => None,
        RawField::Value { line, .. } | RawField::WrongType { line } => *line,
    }
}

fn present<T>(f: &RawField<T>) -> bool {
    !matches!(f, RawField::Missing)
}

fn pick_preset(field: &RawField<String>, key: &str, problems: &mut Vec<Problem>) -> Preset {
    match field {
        RawField::Value { value, line } => lookup_preset(value).unwrap_or_else(|| {
            problems.push(Problem::PresetUnusable { line: *line, value: value.clone() });
            Preset::Nord
        }),
        RawField::WrongType { line } => {
            problems.push(Problem::PresetWrongType { line: *line, key: key.to_string() });
            Preset::Nord
        }
        RawField::Missing => Preset::Nord,
    }
}

fn sort_key(line: &Option<u32>, name: &str) -> (bool, u32, String) {
    (line.is_none(), line.unwrap_or(0), name.to_string())
}

fn range_int(f: &RawField<i64>, min: i64, max: i64, default: u32, bad: &mut Vec<Option<u32>>) -> u32 {
    match f {
        RawField::Missing => default,
        RawField::Value { value, line } => {
            if (min..=max).contains(value) {
                *value as u32
            } else {
                bad.push(*line);
                default
            }
        }
        RawField::WrongType { line } => {
            bad.push(*line);
            default
        }
    }
}

pub fn resolve(raw: &RawAppearance) -> Appearance {
    let mut problems: Vec<Problem> = Vec::new();
    let mut unused_theme: Vec<UnusedItem> = Vec::new();
    let mut unused_colors: Vec<UnusedItem> = Vec::new();

    // ---- [theme]
    let preset = match &raw.theme {
        RawThemeSection::Missing => Preset::Nord,
        RawThemeSection::Str { value, line } => pick_preset(&RawField::Value { value: value.clone(), line: *line }, THEME_KEYS[2], &mut problems),
        RawThemeSection::WrongType { line } => pick_preset(&RawField::<String>::WrongType { line: *line }, THEME_KEYS[2], &mut problems),
        RawThemeSection::Table(t) => {
            let fields = [(&t.preset, THEME_KEYS[0]), (&t.name, THEME_KEYS[1]), (&t.theme, THEME_KEYS[2])];
            match fields.iter().position(|(f, _)| present(f)) {
                None => Preset::Nord,
                Some(i) => {
                    for (j, (f, k)) in fields.iter().enumerate() {
                        if j > i && present(f) {
                            unused_theme.push(UnusedItem { table: "theme".into(), name: k.to_string(), line: field_line(f), used: fields[i].1.to_string() });
                        }
                    }
                    pick_preset(fields[i].0, fields[i].1, &mut problems)
                }
            }
        }
    };

    // ---- [colors]
    let mut colors = [Rgb(0, 0, 0); 16];
    for (i, key) in COLOR_KEYS.iter().enumerate() {
        colors[i] = parse_color(preset.values()[i], slot_of(key).unwrap()).expect("preset values are valid");
    }
    match &raw.colors {
        RawSection::Missing => {}
        RawSection::NotTable { line } => problems.push(Problem::ColorsNotTable { line: *line }),
        RawSection::Table(entries) => {
            let mut bad: Vec<ColorItem> = Vec::new();
            for (i, key) in COLOR_KEYS.iter().enumerate() {
                let alias = COLOR_ALIASES.iter().find(|(_, item)| item == key).map(|(a, _)| *a);
                let canon = entries.iter().find(|(k, _)| k == key);
                let aliased = alias.and_then(|a| entries.iter().find(|(k, _)| k == a));
                let winner = match (canon, aliased) {
                    (Some(c), Some(a)) => {
                        // bg beats background; selected_mark beats selected (T-42)
                        let (w, l) = if *key == "selected" { (a, c) } else { (c, a) };
                        unused_colors.push(UnusedItem { table: "colors".into(), name: l.0.clone(), line: field_line(&l.1), used: w.0.clone() });
                        Some(w)
                    }
                    (Some(c), None) => Some(c),
                    (None, Some(a)) => Some(a),
                    (None, None) => None,
                };
                if let Some((name, field)) = winner {
                    match field {
                        RawField::Value { value, line } => match parse_color(value, slot_of(key).unwrap()) {
                            Some(c) => colors[i] = c,
                            None => bad.push(ColorItem { name: name.clone(), line: *line }),
                        },
                        RawField::WrongType { line } => bad.push(ColorItem { name: name.clone(), line: *line }),
                        RawField::Missing => {}
                    }
                }
            }
            if !bad.is_empty() {
                bad.sort_by_key(|a| sort_key(&a.line, &a.name));
                problems.push(Problem::ColorsUnparsable { items: bad });
            }
        }
    }
    let palette = Palette(colors);
    let bg = colors[0];
    let dark = contrast(Rgb(255, 255, 255), bg) >= contrast(Rgb(0, 0, 0), bg);

    // ---- [font]
    let (family_raw, size_raw) = match &raw.font {
        RawSection::Missing => (RawField::Missing, RawField::Missing),
        RawSection::NotTable { line } => {
            problems.push(Problem::NotTable { line: *line, key: "font".into() });
            (RawField::Missing, RawField::Missing)
        }
        RawSection::Table(f) => (f.family.clone(), f.size.clone()),
    };
    let mut bad_size = Vec::new();
    let font_size = range_int(&size_raw, FONT_SIZE_RANGE.0 as i64, FONT_SIZE_RANGE.1 as i64, DEFAULT_FONT_SIZE, &mut bad_size);
    for line in bad_size {
        problems.push(Problem::FontSize { line });
    }
    let mut user: Vec<String> = Vec::new();
    match &family_raw {
        RawField::Missing => {}
        RawField::WrongType { line } => problems.push(Problem::FontFamily { line: *line }),
        RawField::Value { value: RawFamily::Str(s), line } => {
            if s.is_empty() {
            } else if is_bad_name(s) {
                problems.push(Problem::FontFamily { line: *line });
            } else {
                user.push(s.clone());
            }
        }
        RawField::Value { value: RawFamily::List(items), line } => {
            let mut removed = Vec::new();
            for e in items {
                if e.is_empty() {
                    continue;
                }
                if is_bad_name(e) {
                    removed.push(e.clone());
                } else {
                    user.push(e.clone());
                }
            }
            if !removed.is_empty() {
                problems.push(Problem::FontFamilyElements { line: *line, names: removed });
            }
        }
    }

    // ---- [layout]
    let (min_raw, tree_raw) = match &raw.layout {
        RawSection::Missing => (RawField::Missing, RawField::Missing),
        RawSection::NotTable { line } => {
            problems.push(Problem::NotTable { line: *line, key: "layout".into() });
            (RawField::Missing, RawField::Missing)
        }
        RawSection::Table(l) => (l.min_col_width.clone(), l.tree_width_percent.clone()),
    };
    let mut bad_min = Vec::new();
    let min_col_width = range_int(&min_raw, MIN_COL_WIDTH.1 as i64, MIN_COL_WIDTH.2 as i64, MIN_COL_WIDTH.0, &mut bad_min);
    for line in bad_min {
        problems.push(Problem::LayoutValue { line, key: LAYOUT_KEYS[0].into() });
    }
    let mut bad_tree = Vec::new();
    let tree_width_percent = range_int(&tree_raw, TREE_WIDTH_PERCENT.1 as i64, TREE_WIDTH_PERCENT.2 as i64, TREE_WIDTH_PERCENT.0, &mut bad_tree);
    for line in bad_tree {
        problems.push(Problem::LayoutValue { line, key: LAYOUT_KEYS[1].into() });
    }

    // ---- unused (W-B8): theme first, then colors by line
    unused_colors.sort_by_key(|a| sort_key(&a.line, &a.name));
    let items: Vec<UnusedItem> = unused_theme.into_iter().chain(unused_colors).collect();
    if !items.is_empty() {
        problems.push(Problem::Unused { items });
    }

    Appearance { colors: palette, dark, font_families: merge_families(&user), font_size, row_height: row_height(font_size), min_col_width, tree_width_percent, problems }
}
