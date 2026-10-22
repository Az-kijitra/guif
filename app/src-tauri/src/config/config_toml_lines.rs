//! `config/config_toml_lines.rs`: the 1-based line of every key of `config.toml` that a notice has to name, and the unknown
//! settings (SPEC-0300-0022 R-1642 / R-1643 / R-1643-1; SPEC-0200-0001 §3.17.3 / §3.17.5, spike S-L variant V5).
//!
//! `toml::Value` (which `config_toml::load` judges) keeps no positions, and its `Table` is a `BTreeMap` (alphabetical). So the
//! SAME text is parsed a second time into a small position-keeping tree, `Node`: keys are `Sp<String>` (a `toml::Spanned` that
//! tolerates "no position"), the values of a table are plain `Node`s, the elements of an array are `Sp<Node>`s. That shape is the
//! one that survived every input of the spike: implicit tables, dotted keys, inline tables, datetimes, BOM, CRLF, multi-line
//! strings. Nothing is judged here (MUST-86: the key grammar is not duplicated, only the numbers are collected), the file is not
//! read again, nothing is written (R-1645), and no dependency is added (`toml::Spanned` and the serde API only).

use std::fmt;
use std::ops::Range;

use serde::de::{self, Deserialize, DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use toml::Spanned;

use crate::shared::schema::config_lines::{AppLines, ConfigLines, UnknownSetting};

/// 1 + the number of line feeds before `offset` (clamped to the text). Counted over the BYTES so that an offset inside a
/// multi-byte character cannot panic (SHOULD-121). A `\r` of CRLF does not count; a BOM contains no line feed.
pub fn line_of(text: &str, offset: usize) -> u32 {
    let bytes = text.as_bytes();
    let end = offset.min(bytes.len());
    bytes[..end].iter().filter(|&&b| b == b'\n').count() as u32 + 1
}

// ---------------------------------------------------------------------------------------------- Sp<T>

/// Like `toml::Spanned<T>`, but a value the deserializer has no position for (an implicit table, a dotted-key table) gets
/// `span: None` instead of failing the whole document.
struct Sp<T> {
    span: Option<Range<usize>>,
    value: T,
}

/// Feeds `Spanned`'s own visitor a value that came without a position: `start = end = 0`, then the value itself.
struct Positionless<VD> {
    fields: &'static [&'static str],
    next: usize,
    value: Option<VD>,
}

impl<'de, VD: Deserializer<'de, Error = E>, E: de::Error> MapAccess<'de> for Positionless<VD> {
    type Error = E;

    fn next_key_seed<K: DeserializeSeed<'de>>(&mut self, seed: K) -> Result<Option<K::Value>, E> {
        match self.fields.get(self.next) {
            Some(field) => seed.deserialize(de::value::BorrowedStrDeserializer::<E>::new(field)).map(Some),
            None => Ok(None),
        }
    }

    fn next_value_seed<V: DeserializeSeed<'de>>(&mut self, seed: V) -> Result<V::Value, E> {
        let index = self.next;
        self.next += 1;
        if index < 2 {
            return seed.deserialize(de::value::UsizeDeserializer::<E>::new(0));
        }
        let value = self.value.take().ok_or_else(|| E::custom("the value of a spanned item was requested twice"))?;
        seed.deserialize(value)
    }
}

/// Wraps `Spanned`'s visitor: a real map (the positioned form) goes through; a plain scalar / sequence is re-presented as the
/// positionless map above.
struct FallbackVisitor<V> {
    inner: V,
    fields: &'static [&'static str],
}

macro_rules! scalar_without_position {
    ($visit:ident, $ty:ty, $de:ident) => {
        fn $visit<E: de::Error>(self, v: $ty) -> Result<V::Value, E> {
            self.inner.visit_map(Positionless { fields: self.fields, next: 0, value: Some(de::value::$de::<E>::new(v)) })
        }
    };
}

impl<'de, V: Visitor<'de>> Visitor<'de> for FallbackVisitor<V> {
    type Value = V::Value;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.inner.expecting(f)
    }

    fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<V::Value, A::Error> {
        self.inner.visit_map(map)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, seq: A) -> Result<V::Value, A::Error> {
        let value = de::value::SeqAccessDeserializer::new(seq);
        self.inner.visit_map(Positionless { fields: self.fields, next: 0, value: Some(value) })
    }

    scalar_without_position!(visit_bool, bool, BoolDeserializer);
    scalar_without_position!(visit_i64, i64, I64Deserializer);
    scalar_without_position!(visit_f64, f64, F64Deserializer);
    scalar_without_position!(visit_str, &str, StrDeserializer);
    scalar_without_position!(visit_string, String, StringDeserializer);
}

/// Intercepts `deserialize_struct` (what `Spanned` asks for) to install the `FallbackVisitor`.
struct Intercept<D>(D);

impl<'de, D: Deserializer<'de>> Deserializer<'de> for Intercept<D> {
    type Error = D::Error;

    fn deserialize_struct<V: Visitor<'de>>(
        self,
        name: &'static str,
        fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, D::Error> {
        self.0.deserialize_struct(name, fields, FallbackVisitor { inner: visitor, fields })
    }

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, D::Error> {
        self.0.deserialize_any(visitor)
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string bytes byte_buf option unit unit_struct
        newtype_struct seq tuple tuple_struct map enum identifier ignored_any
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Sp<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let spanned = Spanned::<T>::deserialize(Intercept(deserializer))?;
        let range = spanned.span();
        let span = if range.start == 0 && range.end == 0 { None } else { Some(range) };
        Ok(Sp { span, value: spanned.into_inner() })
    }
}

// ---------------------------------------------------------------------------------------------- Node

/// The name `toml` gives the single key of a datetime value (a map of one entry); such a map is a leaf, not a table.
const DATETIME_KEY: &str = "$__toml_private_datetime";

enum Node {
    Table(Vec<(Sp<String>, Node)>),
    Array(Vec<Sp<Node>>),
    Leaf,
}

struct NodeVisitor;

macro_rules! leaf {
    ($visit:ident, $ty:ty) => {
        fn $visit<E>(self, _: $ty) -> Result<Node, E> {
            Ok(Node::Leaf)
        }
    };
}

impl<'de> Visitor<'de> for NodeVisitor {
    type Value = Node;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("any TOML value")
    }

    leaf!(visit_bool, bool);
    leaf!(visit_i64, i64);
    leaf!(visit_f64, f64);
    leaf!(visit_str, &str);
    leaf!(visit_string, String);

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Node, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = seq.next_element::<Sp<Node>>()? {
            items.push(item);
        }
        Ok(Node::Array(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Node, A::Error> {
        let mut entries = Vec::new();
        while let Some(key) = map.next_key::<Sp<String>>()? {
            if key.value == DATETIME_KEY {
                map.next_value::<String>()?;
                return Ok(Node::Leaf);
            }
            entries.push((key, map.next_value::<Node>()?));
        }
        Ok(Node::Table(entries))
    }
}

impl<'de> Deserialize<'de> for Node {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(NodeVisitor)
    }
}

// ---------------------------------------------------------------------------------------------- the index

/// Everything `load` takes from the second parse: the lines of the known keys, and the unknown settings in DOCUMENT order
/// (R-1643-1; `toml::Table` would give the alphabetical order).
pub struct Indexed {
    pub lines: ConfigLines,
    pub unknown: Vec<UnknownSetting>,
}


fn key_line(text: &str, key: &Sp<String>) -> Option<u32> {
    key.span.as_ref().map(|span| line_of(text, span.start))
}

fn app_lines(text: &str, position: usize, element: &Sp<Node>, unknown: &mut Vec<UnknownSetting>) -> AppLines {
    let mut app = AppLines { header: element.span.as_ref().map(|span| line_of(text, span.start)), ..AppLines::default() };
    let Node::Table(fields) = &element.value else { return app };
    for (field, _) in fields {
        let line = key_line(text, field);
        match field.value.as_str() {
            "name" => app.name = line,
            "program" => app.program = line,
            "args" => app.args = line,
            "args_for_file" => app.args_for_file = line,
            "key" => app.key = line,
            other => unknown.push(UnknownSetting::AppField { position, name: other.to_string(), line }),
        }
    }
    app
}

/// `None` only when the whole text cannot be parsed (a syntax error): then `toml::Value` fails too and `load` reports W-31.
pub fn index_full(text: &str) -> Option<Indexed> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Node::Table(top) = toml::from_str::<Node>(text).ok()? else { return Some(Indexed { lines: ConfigLines::default(), unknown: Vec::new() }) };
    let mut lines = ConfigLines::default();
    let mut unknown = Vec::new();
    for (key, value) in &top {
        let line = key_line(text, key);
        match (key.value.as_str(), value) {
            ("ui_theme", _) => lines.ui_theme = line,
            ("input_keymap_custom", value) => {
                lines.input_keymap_custom = line;
                if let Node::Table(entries) = value {
                    for (entry, _) in entries {
                        if let Some(entry_line) = key_line(text, entry) {
                            lines.keymap_entries.insert(entry.value.clone(), entry_line);
                        }
                    }
                }
            }
            ("external_apps", value) => {
                lines.external_apps.line = line;
                // A non-table element makes the whole value a type error (Q-1): its fields are not judged, so none is "unknown".
                if let Node::Array(items) = value {
                    let all_tables = items.iter().all(|item| matches!(item.value, Node::Table(_)));
                    let mut ignored = Vec::new();
                    for (i, item) in items.iter().enumerate() {
                        let sink = if all_tables { &mut unknown } else { &mut ignored };
                        lines.external_apps.apps.push(app_lines(text, i + 1, item, sink));
                    }
                }
            }
            (other, _) => unknown.push(UnknownSetting::Top { name: other.to_string(), line }),
        }
    }
    Some(Indexed { lines, unknown })
}

/// R-1642: the lines of the known keys of `text`, `None` when the text has a syntax error.
pub fn index(text: &str) -> Option<ConfigLines> {
    index_full(text).map(|indexed| indexed.lines)
}
