//! CF_HDROP / Preferred DropEffect byte layout. Pure (SPEC-0200-0001 §3.10.2, §3.10.3).
//! The constants are Windows ABI values kept here so `Win32_System_Ole` is not needed.

pub const CF_HDROP: u32 = 15;
pub const DROPEFFECT_COPY: u32 = 1;
pub const DROPEFFECT_MOVE: u32 = 2;
/// `sizeof(DROPFILES)`: pFiles(4) + pt(8) + fNC(4) + fWide(4).
pub const DROPFILES_HEADER_LEN: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    Copy,
    Move,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HdropError {
    /// No paths.
    Empty,
    /// A path contains U+0000.
    ContainsNul,
    /// `parse_hdrop` input is not a wide DROPFILES block.
    Malformed,
}

/// DROPFILES (pFiles = 20, pt = (0,0), fNC = 0, fWide = 1) + each path as
/// UTF-16LE + 0x0000, + a final 0x0000.
pub fn build_hdrop(paths: &[String]) -> Result<Vec<u8>, HdropError> {
    if paths.is_empty() {
        return Err(HdropError::Empty);
    }
    if paths.iter().any(|p| p.contains('\0')) {
        return Err(HdropError::ContainsNul);
    }
    let mut bytes = Vec::with_capacity(DROPFILES_HEADER_LEN + paths.iter().map(|p| p.len() * 2 + 2).sum::<usize>() + 2);
    bytes.extend_from_slice(&(DROPFILES_HEADER_LEN as u32).to_le_bytes()); // pFiles
    bytes.extend_from_slice(&[0u8; 8]); // pt
    bytes.extend_from_slice(&0u32.to_le_bytes()); // fNC
    bytes.extend_from_slice(&1u32.to_le_bytes()); // fWide
    for p in paths {
        for unit in p.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes.extend_from_slice(&0u16.to_le_bytes());
    }
    bytes.extend_from_slice(&0u16.to_le_bytes());
    Ok(bytes)
}

/// Inverse of `build_hdrop` (wide only). Items that are not valid UTF-16
/// (lone surrogates) or empty are dropped (SPEC-0200-0001 §3.10.14 G-12,
/// §3.10.17.7 SHOULD-172).
pub fn parse_hdrop(bytes: &[u8]) -> Result<Vec<String>, HdropError> {
    if bytes.len() < DROPFILES_HEADER_LEN {
        return Err(HdropError::Malformed);
    }
    let word = |at: usize| u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    let start = word(0) as usize;
    if word(16) == 0 || start < DROPFILES_HEADER_LEN || start > bytes.len() {
        return Err(HdropError::Malformed);
    }
    let units: Vec<u16> = bytes[start..].as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
    let mut out = Vec::new();
    for item in units.split(|u| *u == 0) {
        if item.is_empty() {
            // an empty item: the double NUL end (or an empty entry) -- skipped.
            continue;
        }
        if let Some(path) = decode_wide_path(item) {
            out.push(path);
        }
    }
    Ok(out)
}

/// `[1,0,0,0]` for copy, `[2,0,0,0]` for move (little endian DWORD).
pub fn effect_bytes(effect: Effect) -> [u8; 4] {
    match effect {
        Effect::Copy => DROPEFFECT_COPY,
        Effect::Move => DROPEFFECT_MOVE,
    }
    .to_le_bytes()
}

/// UTF-16 with a trailing 0.
pub fn to_wide_nul(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// UTF-16 units (no terminator) -> String; `None` for empty input or an
/// unpaired surrogate (G-12).
pub fn decode_wide_path(units: &[u16]) -> Option<String> {
    if units.is_empty() {
        return None;
    }
    String::from_utf16(units).ok()
}
