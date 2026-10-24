use super::color::{contrast, Rgb};

const LIGHT: [u32; 13] = [0xd73a49, 0x6f42c1, 0x005cc5, 0x032f62, 0xc24e00, 0x6a737d, 0x22863a, 0x005cc5, 0x735c0f, 0x1e7f35, 0xf0fff4, 0xb31d28, 0xffeef0];
const DARK: [u32; 13] = [0xff7b72, 0xd2a8ff, 0x79c0ff, 0xa5d6ff, 0xffa657, 0x8b949e, 0x7ee787, 0x4a8cf7, 0xf2cc60, 0xaff5b4, 0x033a16, 0xffdcd7, 0x67060c];

fn rgb(v: u32) -> Rgb {
    Rgb((v >> 16) as u8, (v >> 8) as u8, v as u8)
}

fn to_hsl(c: Rgb) -> (f64, f64, f64) {
    let (r, g, b) = (c.0 as f64 / 255.0, c.1 as f64 / 255.0, c.2 as f64 / 255.0);
    let (mx, mn) = (r.max(g).max(b), r.min(g).min(b));
    let l = (mx + mn) / 2.0;
    let d = mx - mn;
    if d == 0.0 {
        return (0.0, 0.0, l);
    }
    let s = if l > 0.5 { d / (2.0 - mx - mn) } else { d / (mx + mn) };
    let h = if mx == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if mx == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

fn from_hsl(h: f64, s: f64, l: f64) -> Rgb {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = match h {
        h if h < 60.0 => (c, x, 0.0),
        h if h < 120.0 => (x, c, 0.0),
        h if h < 180.0 => (0.0, c, x),
        h if h < 240.0 => (0.0, x, c),
        h if h < 300.0 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let f = |v: f64| ((v + m) * 255.0).round() as u8;
    Rgb(f(r), f(g), f(b))
}

pub fn adjust(color: Rgb, bg: Rgb, dark: bool) -> Rgb {
    if contrast(color, bg) >= 4.5 {
        return color;
    }
    let (h, s, l0) = to_hsl(color);
    let mut k = 0.0;
    loop {
        k += 1.0;
        let l = (l0 + if dark { 0.01 } else { -0.01 } * k).clamp(0.0, 1.0);
        let cur = from_hsl(h, s, l);
        if contrast(cur, bg) >= 4.5 || l <= 0.0 || l >= 1.0 {
            return cur;
        }
    }
}

pub fn highlight_colors(bg: Rgb, dark: bool) -> [Rgb; 13] {
    let column = if dark { DARK } else { LIGHT };
    let mut out = [Rgb(0, 0, 0); 13];
    for i in 0..13 {
        let c = rgb(column[i]);
        out[i] = match i {
            10 | 12 => c,
            9 => adjust(c, rgb(column[10]), dark),
            11 => adjust(c, rgb(column[12]), dark),
            _ => adjust(c, bg, dark),
        };
    }
    out
}
