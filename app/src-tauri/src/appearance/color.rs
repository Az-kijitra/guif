#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    Background,
    Foreground,
}

const fn c(v: u32) -> Rgb {
    Rgb((v >> 16) as u8, (v >> 8) as u8, v as u8)
}

const ANSI16: [Rgb; 16] = [
    c(0x282C34), c(0xE06C75), c(0x658251), c(0xE5C07B), c(0x61AFEF), c(0xC678DD), c(0x56B6C2), c(0xDCDFE4),
    c(0x5A6374), c(0xE06C75), c(0x98C379), c(0xE5C07B), c(0x61AFEF), c(0xC678DD), c(0x56B6C2), c(0xDCDFE4),
];

pub fn xterm_256(n: u8) -> Rgb {
    match n {
        0..=15 => ANSI16[n as usize],
        16..=231 => {
            const L: [u8; 6] = [0, 95, 135, 175, 215, 255];
            let i = (n - 16) as usize;
            Rgb(L[i / 36], L[(i / 6) % 6], L[i % 6])
        }
        _ => {
            let v = 8 + 10 * (n - 232);
            Rgb(v, v, v)
        }
    }
}

fn parse_hex(h: &str) -> Option<Rgb> {
    if !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let d = |s: &str| u8::from_str_radix(s, 16).ok();
    match h.len() {
        6 => Some(Rgb(d(&h[0..2])?, d(&h[2..4])?, d(&h[4..6])?)),
        3 => Some(Rgb(d(&h[0..1])? * 17, d(&h[1..2])? * 17, d(&h[2..3])? * 17)),
        _ => None,
    }
}

fn parse_number(t: &str) -> Option<u8> {
    let rest = t.strip_prefix('+').unwrap_or(t);
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    rest.parse::<u8>().ok()
}

pub fn parse_color(text: &str, slot: Slot) -> Option<Rgb> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(h) = t.strip_prefix('#') {
        return parse_hex(h);
    }
    if let Some(n) = parse_number(t) {
        return Some(xterm_256(n));
    }
    let key = t.to_ascii_lowercase().replace(['-', ' '], "_");
    let n = match key.as_str() {
        "reset" | "default" | "none" => return Some(if slot == Slot::Background { Rgb(0, 0, 0) } else { ANSI16[7] }),
        "black" => 0,
        "red" => 1,
        "green" => 2,
        "yellow" => 3,
        "blue" => 4,
        "magenta" | "purple" => 5,
        "cyan" => 6,
        "gray" | "grey" => 7,
        "dark_gray" | "dark_grey" | "darkgray" | "darkgrey" => 8,
        "light_red" | "lightred" => 9,
        "light_green" | "lightgreen" => 10,
        "light_yellow" | "lightyellow" => 11,
        "light_blue" | "lightblue" => 12,
        "light_magenta" | "lightmagenta" | "light_purple" | "lightpurple" => 13,
        "light_cyan" | "lightcyan" => 14,
        "white" => 15,
        _ => return None,
    };
    Some(ANSI16[n])
}

pub fn luminance(c: Rgb) -> f64 {
    let lin = |v: u8| {
        let s = v as f64 / 255.0;
        if s <= 0.03928 {
            s / 12.92
        } else {
            ((s + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(c.0) + 0.7152 * lin(c.1) + 0.0722 * lin(c.2)
}

pub fn contrast(a: Rgb, b: Rgb) -> f64 {
    let (x, y) = (luminance(a), luminance(b));
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}

pub fn mix(a_ratio: f64, a: Rgb, b: Rgb) -> Rgb {
    let f = |x: u8, y: u8| (a_ratio * x as f64 + (1.0 - a_ratio) * y as f64).round() as u8;
    Rgb(f(a.0, b.0), f(a.1, b.1), f(a.2, b.2))
}

pub fn hex(c: Rgb) -> String {
    format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)
}
