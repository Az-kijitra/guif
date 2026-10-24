pub const THEME_KEYS: [&str; 3] = ["preset", "name", "theme"];
pub const COLOR_KEYS: [&str; 16] = [
    "bg", "border", "border_inactive", "cursor_fg", "cursor_bg", "folder", "file", "symlink", "executable", "selected", "status_bar_fg", "status_bar_bg",
    "menu_bar_active_fg", "menu_bar_active_bg", "tree_current", "tree_cursor",
];
pub const BORDER_INACTIVE: &str = COLOR_KEYS[2];
pub const CURSOR_FG: &str = COLOR_KEYS[3];
pub const CURSOR_BG: &str = COLOR_KEYS[4];
pub const STATUS_BAR_FG: &str = COLOR_KEYS[10];
pub const STATUS_BAR_BG: &str = COLOR_KEYS[11];
pub const MENU_BAR_ACTIVE_FG: &str = COLOR_KEYS[12];
pub const MENU_BAR_ACTIVE_BG: &str = COLOR_KEYS[13];
pub const TREE_CURRENT: &str = COLOR_KEYS[14];
pub const TREE_CURSOR: &str = COLOR_KEYS[15];
pub const COLOR_ALIASES: [(&str, &str); 2] = [("background", "bg"), ("selected_mark", "selected")];
pub const FONT_KEYS: [&str; 2] = ["family", "size"];
pub const LAYOUT_KEYS: [&str; 2] = ["min_col_width", "tree_width_percent"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawField<T> {
    Missing,
    Value { value: T, line: Option<u32> },
    WrongType { line: Option<u32> },
}
#[allow(clippy::derivable_impls)] // a derive would require `T: Default`
impl<T> Default for RawField<T> {
    fn default() -> Self {
        RawField::Missing
    }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawFamily {
    Str(String),
    List(Vec<String>),
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawSection<T> {
    Missing,
    NotTable { line: Option<u32> },
    Table(T),
}
#[allow(clippy::derivable_impls)] // a derive would require `T: Default`
impl<T> Default for RawSection<T> {
    fn default() -> Self {
        RawSection::Missing
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawTheme {
    pub line: Option<u32>,
    pub preset: RawField<String>,
    pub name: RawField<String>,
    pub theme: RawField<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum RawThemeSection {
    #[default]
    Missing,
    Table(RawTheme),
    Str { value: String, line: Option<u32> },
    WrongType { line: Option<u32> },
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawFont {
    pub family: RawField<RawFamily>,
    pub size: RawField<i64>,
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawLayout {
    pub min_col_width: RawField<i64>,
    pub tree_width_percent: RawField<i64>,
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawAppearance {
    pub theme: RawThemeSection,
    pub colors: RawSection<Vec<(String, RawField<String>)>>,
    pub font: RawSection<RawFont>,
    pub layout: RawSection<RawLayout>,
}
