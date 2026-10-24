pub mod color;
pub mod commands;
pub mod dto;
pub mod font;
pub mod highlight;
pub mod paint;
pub mod presets;
pub mod resolve;
pub mod vars;

pub use resolve::{resolve, Appearance, ColorItem, Palette, Problem, UnusedItem};

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod color_tests;
#[cfg(test)]
mod presets_tests;
#[cfg(test)]
mod resolve_tests;
#[cfg(test)]
mod resolve_colors_tests;
#[cfg(test)]
mod resolve_layout_tests;
#[cfg(test)]
mod font_tests;
#[cfg(test)]
mod vars_tests;
#[cfg(test)]
mod highlight_tests;
#[cfg(test)]
mod contrast_tests;
#[cfg(test)]
mod paint_tests;
#[cfg(test)]
mod commands_tests;
