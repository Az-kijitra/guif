use super::color::Slot;
use crate::shared::schema::appearance_raw::COLOR_KEYS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preset {
    Default,
    Nord,
    Monokai,
    Catppuccin,
    Solarized,
    Light,
}

impl Preset {
    pub const ALL: [Preset; 6] = [Preset::Default, Preset::Nord, Preset::Monokai, Preset::Catppuccin, Preset::Solarized, Preset::Light];

    pub fn id(self) -> &'static str {
        match self {
            Preset::Default => "default",
            Preset::Nord => "nord",
            Preset::Monokai => "monokai",
            Preset::Catppuccin => "catppuccin",
            Preset::Solarized => "solarized",
            Preset::Light => "light",
        }
    }

    pub fn values(self) -> [&'static str; 16] {
        match self {
            Preset::Default => ["Reset", "Cyan", "DarkGray", "Black", "Cyan", "Yellow", "Reset", "LightMagenta", "LightGreen", "LightBlue", "White", "DarkGray", "Black", "Cyan", "Cyan", "Yellow"],
            Preset::Nord => ["#2E3440", "#88C0D0", "#4C566A", "#2E3440", "#8FBCBB", "#81A1C1", "#ECEFF4", "#B48EAD", "#A3BE8C", "#EBCB8B", "#E5E9F0", "#3B4252", "#2E3440", "#88C0D0", "#88C0D0", "#EBCB8B"],
            Preset::Monokai => ["#272822", "#F92672", "#75715E", "#272822", "#A6E22E", "#FD971F", "#F8F8F2", "#AE81FF", "#A6E22E", "#E6DB74", "#F8F8F2", "#3E3D32", "#272822", "#F92672", "#66D9EF", "#E6DB74"],
            Preset::Catppuccin => ["#1E1E2E", "#CBA6F7", "#585B70", "#11111B", "#89B4FA", "#F9E2AF", "#CDD6F4", "#F5C2E7", "#A6E3A1", "#FAB387", "#CDD6F4", "#313244", "#11111B", "#CBA6F7", "#89DCEB", "#F9E2AF"],
            Preset::Solarized => ["#002B36", "#268BD2", "#073642", "#002B36", "#2AA198", "#B58900", "#839496", "#D33682", "#859900", "#CB4B16", "#93A1A1", "#073642", "#002B36", "#268BD2", "#2AA198", "#B58900"],
            Preset::Light => ["#F5F5F5", "#0066CC", "#B4B4B4", "#FFFFFF", "#0078D7", "#D97706", "#1F2937", "#7C3AED", "#16A34A", "#EA580C", "#374151", "#E5E7EB", "#FFFFFF", "#0078D7", "#0066CC", "#D97706"],
        }
    }
}

pub fn normalize_preset_name(name: &str) -> String {
    name.to_ascii_lowercase().replace(['-', '_', ' '], "")
}

pub fn lookup_preset(name: &str) -> Option<Preset> {
    match normalize_preset_name(name).as_str() {
        "default" => Some(Preset::Default),
        "nord" => Some(Preset::Nord),
        "monokai" => Some(Preset::Monokai),
        "catppuccin" | "catppuccinmocha" => Some(Preset::Catppuccin),
        "solarizeddark" | "solarized" => Some(Preset::Solarized),
        "light" => Some(Preset::Light),
        _ => None,
    }
}

pub fn slot_of(key: &str) -> Option<Slot> {
    let at = COLOR_KEYS.iter().position(|k| *k == key)?;
    Some(if [0, 4, 11, 13].contains(&at) { Slot::Background } else { Slot::Foreground })
}
