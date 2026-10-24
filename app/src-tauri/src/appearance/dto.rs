use serde::Serialize;

use crate::shared::schema::appearance_raw::LAYOUT_KEYS;

use super::color::hex;
use super::font::{css_font_family, DEFAULT_FONT_SIZE, FONT_SIZE_RANGE, MIN_COL_WIDTH, TREE_WIDTH_PERCENT};
use super::presets::Preset;
use super::resolve::{Appearance, Problem};
use super::vars::ui_vars;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemItemDto {
    pub table: Option<String>,
    pub name: String,
    pub line: Option<u32>,
    pub used: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemDto {
    pub kind: &'static str,
    pub line: Option<u32>,
    pub key: Option<String>,
    pub value: Option<String>,
    pub usable: Option<Vec<String>>,
    pub default: Option<u32>,
    pub min: Option<u32>,
    pub max: Option<u32>,
    pub names: Option<Vec<String>>,
    pub items: Option<Vec<ProblemItemDto>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceDto {
    pub dark: bool,
    pub bg: String,
    /// `[name, value]` pairs (a tuple is a JSON array), in the order of `ui_vars()`.
    pub ui_vars: Vec<(&'static str, String)>,
    pub font_family: String,
    pub font_size: u32,
    pub row_height: u32,
    pub min_col_width: u32,
    pub tree_width_percent: u32,
    pub problems: Vec<ProblemDto>,
}

fn base(kind: &'static str) -> ProblemDto {
    ProblemDto { kind, line: None, key: None, value: None, usable: None, default: None, min: None, max: None, names: None, items: None }
}

fn problem_dto(p: &Problem) -> ProblemDto {
    match p {
        Problem::PresetUnusable { line, value } => ProblemDto {
            line: *line,
            value: Some(value.clone()),
            usable: Some(Preset::ALL.iter().map(|p| p.id().to_string()).collect()),
            ..base("presetUnusable")
        },
        Problem::PresetWrongType { line, key } => ProblemDto { line: *line, key: Some(key.clone()), ..base("presetWrongType") },
        Problem::ColorsUnparsable { items } => ProblemDto {
            items: Some(items.iter().map(|i| ProblemItemDto { table: None, name: i.name.clone(), line: i.line, used: None }).collect()),
            ..base("colorsUnparsable")
        },
        Problem::ColorsNotTable { line } => ProblemDto { line: *line, ..base("colorsNotTable") },
        Problem::FontSize { line } => ProblemDto { line: *line, key: Some("size".into()), default: Some(DEFAULT_FONT_SIZE), min: Some(FONT_SIZE_RANGE.0), max: Some(FONT_SIZE_RANGE.1), ..base("fontSize") },
        Problem::FontFamily { line } => ProblemDto { line: *line, ..base("fontFamily") },
        Problem::FontFamilyElements { line, names } => ProblemDto { line: *line, names: Some(names.clone()), ..base("fontFamilyElements") },
        Problem::NotTable { line, key } => ProblemDto { line: *line, key: Some(key.clone()), ..base("notTable") },
        Problem::LayoutValue { line, key } => {
            let (default, min, max) = if key == LAYOUT_KEYS[0] { MIN_COL_WIDTH } else { TREE_WIDTH_PERCENT };
            ProblemDto { line: *line, key: Some(key.clone()), default: Some(default), min: Some(min), max: Some(max), ..base("layoutValue") }
        }
        Problem::Unused { items } => ProblemDto {
            items: Some(items.iter().map(|i| ProblemItemDto { table: Some(i.table.clone()), name: i.name.clone(), line: i.line, used: Some(i.used.clone()) }).collect()),
            ..base("unused")
        },
    }
}

pub fn appearance_dto(a: &Appearance) -> AppearanceDto {
    AppearanceDto {
        dark: a.dark,
        bg: hex(a.colors.get("bg").unwrap()),
        ui_vars: ui_vars(a),
        font_family: css_font_family(&a.font_families),
        font_size: a.font_size,
        row_height: a.row_height,
        min_col_width: a.min_col_width,
        tree_width_percent: a.tree_width_percent,
        problems: a.problems.iter().map(problem_dto).collect(),
    }
}
