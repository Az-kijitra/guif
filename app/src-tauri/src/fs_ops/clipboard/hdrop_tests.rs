//! TDD (unit-test-writer, Phase 11, 2026-10-03): CF_HDROP / DropEffect bytes.
//! Specs: SPEC-0300-0011 R-15-2, R-16, R-15-4; SPEC-0200-0001 §3.10.2,
//! §3.10.7, §3.10.12, §3.10.14 G-12.

use super::hdrop::{
    build_hdrop, decode_wide_path, effect_bytes, parse_hdrop, to_wide_nul, Effect, HdropError, CF_HDROP,
    DROPEFFECT_COPY, DROPEFFECT_MOVE, DROPFILES_HEADER_LEN,
};

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|x| x.to_string()).collect()
}

fn u32_at(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

fn wide_units(bytes: &[u8]) -> Vec<u16> {
    bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect()
}

#[test]
fn constants_are_the_windows_abi_values() {
    assert_eq!(CF_HDROP, 15);
    assert_eq!(DROPEFFECT_COPY, 1);
    assert_eq!(DROPEFFECT_MOVE, 2);
    assert_eq!(DROPFILES_HEADER_LEN, 20);
}

// R-15-2: DROPFILES header = pFiles 20, pt (0,0), fNC 0, fWide 1.
#[test]
fn the_header_is_20_bytes_with_pfiles_20_pt_zero_fnc_zero_fwide_one() {
    let b = build_hdrop(&s(&[r"C:\a.txt"])).unwrap();
    assert_eq!(u32_at(&b, 0), 20, "pFiles");
    assert_eq!(u32_at(&b, 4), 0, "pt.x");
    assert_eq!(u32_at(&b, 8), 0, "pt.y");
    assert_eq!(u32_at(&b, 12), 0, "fNC");
    assert_eq!(u32_at(&b, 16), 1, "fWide");
}

#[test]
fn paths_follow_the_header_as_utf16le_nul_separated_with_a_double_nul_end() {
    let b = build_hdrop(&s(&[r"C:\a.txt", r"D:\é\b"])).unwrap();
    let body = wide_units(&b[20..]);
    let mut expected: Vec<u16> = Vec::new();
    for p in [r"C:\a.txt", r"D:\é\b"] {
        expected.extend(p.encode_utf16());
        expected.push(0);
    }
    expected.push(0);
    assert_eq!(body, expected);
    assert_eq!(b.len(), 20 + expected.len() * 2);
    assert_eq!(&b[b.len() - 4..], &[0, 0, 0, 0], "double NUL terminator");
}

#[test]
fn a_single_path_ends_with_exactly_two_nuls() {
    let b = build_hdrop(&s(&["C:\\a"])).unwrap();
    let units = wide_units(&b[20..]);
    assert_eq!(&units[units.len() - 2..], &[0u16, 0u16]);
    assert_ne!(units[units.len() - 3], 0);
}

#[test]
fn non_bmp_characters_are_written_as_surrogate_pairs() {
    let b = build_hdrop(&s(&["C:\\😀"])).unwrap();
    let units = wide_units(&b[20..]);
    assert!(units.contains(&0xD83D) && units.contains(&0xDE00));
}

#[test]
fn paths_are_written_verbatim_without_normalisation() {
    let p = r"\\?\UNC\Server\Share\Ab.TXT";
    let b = build_hdrop(&s(&[p])).unwrap();
    let units = wide_units(&b[20..]);
    let first: Vec<u16> = units.iter().copied().take_while(|u| *u != 0).collect();
    assert_eq!(first, p.encode_utf16().collect::<Vec<_>>());
}

#[test]
fn an_empty_list_is_an_error() {
    assert_eq!(build_hdrop(&[]), Err(HdropError::Empty));
}

#[test]
fn a_path_containing_nul_is_an_error() {
    assert_eq!(build_hdrop(&s(&["C:\\a\0b"])), Err(HdropError::ContainsNul));
    assert_eq!(build_hdrop(&s(&["C:\\ok", "C:\\a\0b"])), Err(HdropError::ContainsNul));
}

// round trip through the analysis function
#[test]
fn build_then_parse_round_trips_in_order() {
    let paths = s(&[r"C:\a.txt", r"\\server\share\日本語 フォルダ\b", r"\\?\C:\x\😀"]);
    let b = build_hdrop(&paths).unwrap();
    assert_eq!(parse_hdrop(&b).unwrap(), paths);
}

#[test]
fn parse_rejects_garbage() {
    assert_eq!(parse_hdrop(&[]), Err(HdropError::Malformed));
    assert_eq!(parse_hdrop(&[1, 2, 3]), Err(HdropError::Malformed));
}

// G-12: a lone surrogate item is dropped, the rest survive.
#[test]
fn parse_drops_items_with_unpaired_surrogates_and_empty_items() {
    let mut b = build_hdrop(&s(&["C:\\ok"])).unwrap();
    b.truncate(b.len() - 2); // remove the final NUL, then append a bad item + double end
    for u in [0xD800u16, 0x0043, 0] {
        b.extend(u.to_le_bytes());
    }
    for u in "C:\\after".encode_utf16().chain([0, 0]) {
        b.extend(u.to_le_bytes());
    }
    assert_eq!(parse_hdrop(&b).unwrap(), s(&["C:\\ok", "C:\\after"]));
}

#[test]
fn decode_wide_path_handles_pairs_lone_surrogates_and_empty() {
    assert_eq!(decode_wide_path(&"C:\\a😀".encode_utf16().collect::<Vec<_>>()).as_deref(), Some("C:\\a😀"));
    assert_eq!(decode_wide_path(&[0x0043, 0xD800]), None, "lone high surrogate");
    assert_eq!(decode_wide_path(&[0xDC00, 0x0043]), None, "lone low surrogate");
    assert_eq!(decode_wide_path(&[0xDE00, 0xD83D]), None, "reversed pair");
    assert_eq!(decode_wide_path(&[]), None);
}

// R-15-2 / R-16: Preferred DropEffect is a 4-byte DWORD.
#[test]
fn drop_effect_bytes_are_copy_1_and_move_2_little_endian() {
    assert_eq!(effect_bytes(Effect::Copy), [1, 0, 0, 0]);
    assert_eq!(effect_bytes(Effect::Move), [2, 0, 0, 0]);
}

#[test]
fn to_wide_nul_appends_one_nul() {
    assert_eq!(to_wide_nul(""), vec![0u16]);
    assert_eq!(to_wide_nul("ab"), vec![0x61, 0x62, 0]);
    assert_eq!(to_wide_nul("😀"), vec![0xD83D, 0xDE00, 0]);
}
