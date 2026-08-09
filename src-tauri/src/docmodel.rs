//! Document-model analysis over the v1 AST codec (`document.MarshalJSON` in
//! the libmdviewer Go library, `ffi::parse`'s output).
//!
//! ## Real codec shape (verified against the library, not inferred)
//!
//! Field names actually emitted by `ffi::parse` differ from a naive reading
//! of "kids"/"text" placeholders: container nodes use `"children"`, and a
//! leaf's textual payload lives in `"value"`, not `"text"`. Verified by
//! probing the linked dylib directly:
//!
//! ```text
//! parse("# Title\n\nsome words here\n\n## Sub Head\n\nmore\n") ==
//! {"version":1,"kind":"document","children":[
//!   {"kind":"heading","level":1,"anchorId":"title","span":{"startLine":1,...},
//!    "children":[{"kind":"text","value":"Title"}]},
//!   {"kind":"paragraph","span":{"startLine":3,...},
//!    "children":[{"kind":"text","value":"some words here"}]},
//!   {"kind":"heading","level":2,"anchorId":"sub-head","span":{"startLine":5,...},
//!    "children":[{"kind":"text","value":"Sub Head"}]},
//!   {"kind":"paragraph","span":{"startLine":7,...},
//!    "children":[{"kind":"text","value":"more"}]}
//! ]}
//!
//! parse("# A *b* `c`\n") == {"version":1,"kind":"document","children":[
//!   {"kind":"heading","level":1,"anchorId":"a-b-c","span":{"startLine":1,...},
//!    "children":[
//!      {"kind":"text","value":"A "},
//!      {"kind":"emphasis","children":[{"kind":"text","value":"b"}]},
//!      {"kind":"text","value":" "},
//!      {"kind":"codeSpan","value":"c"}
//!    ]}
//! ]}
//!
//! parse("") == {"version":1,"kind":"document"}  (no "children" key at all)
//! ```
//!
//! This walker therefore reads `kind`, `level`, `span.startLine`, `value`,
//! and `children` — never the brief's placeholder `"kids"`/`"text"` keys.
//!
//! ## Rules shipped
//!
//! - **Outline**: every `heading` node in document order becomes
//!   `(level, text, span.startLine)`. `text` is the node's flattened
//!   textual content (see below). A heading missing a `span` (shouldn't
//!   happen for real parses, but the walk is defensive) reports line 0.
//! - **Heading/flattened text**: concatenation, in document order, of the
//!   `value` field of every descendant `text` node and every descendant
//!   `codeSpan` node (inline code counts as text for display purposes —
//!   this is what makes `# A *b* \`c\`` flatten to `"A b c"`; the emphasis
//!   wrapper itself carries no text, only its `text` child does).
//! - **Word count**: whitespace-split token count over the `value` of
//!   every `text` node in the whole document (headings included — a
//!   heading's words are still part of the document's text). Deliberately
//!   narrower than the heading-text rule above: inline code (`codeSpan`)
//!   is excluded from the word count so reading-time estimates aren't
//!   inflated by short code tokens. Verified against the brief's own
//!   worked example: `"# Title\n\nsome words here\n\n## Sub Head\n\nmore\n"`
//!   yields 7 words (Title, some, words, here, Sub, Head, more) — not the
//!   brief's placeholder "6"; the brief flagged this figure as unverified
//!   ("count actual behavior") and 7 is what the documented rule and the
//!   real parser output actually produce.
//! - **read_minutes**: `max(1, round(words / 220))`.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OutlineItem {
    pub level: u8,
    pub text: String,
    pub line: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DocModel {
    pub outline: Vec<OutlineItem>,
    pub words: u32,
    pub read_minutes: u32,
}

/// Parses the v1 AST JSON produced by `ffi::parse` and computes the
/// document model (outline, word count, estimated read time).
pub fn analyze(ast_json: &str) -> Result<DocModel, serde_json::Error> {
    let root: Value = serde_json::from_str(ast_json)?;

    let mut outline = Vec::new();
    let mut words: u32 = 0;
    if let Some(children) = root.get("children").and_then(Value::as_array) {
        for child in children {
            walk(child, &mut outline, &mut words);
        }
    }
    let read_minutes = ((words as f64) / 220.0).round().max(1.0) as u32;

    Ok(DocModel { outline, words, read_minutes })
}

/// Walks one node and its descendants, appending outline entries for
/// `heading` nodes and accumulating the document's word count.
fn walk(node: &Value, outline: &mut Vec<OutlineItem>, words: &mut u32) {
    let kind = node.get("kind").and_then(Value::as_str).unwrap_or("");

    if kind == "heading" {
        let level = node.get("level").and_then(Value::as_u64).unwrap_or(0) as u8;
        let line = node
            .get("span")
            .and_then(|s| s.get("startLine"))
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32;
        let text = flatten_text(node);
        outline.push(OutlineItem { level, text, line });
    }

    if kind == "text"
        && let Some(v) = node.get("value").and_then(Value::as_str)
    {
        *words += v.split_whitespace().count() as u32;
    }

    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            walk(child, outline, words);
        }
    }
}

/// Concatenates, in document order, the textual content of every
/// descendant `text` and `codeSpan` node under `node` (`node` itself
/// included if it is such a leaf). Used for heading-text extraction.
fn flatten_text(node: &Value) -> String {
    let mut out = String::new();
    flatten_text_into(node, &mut out);
    out
}

fn flatten_text_into(node: &Value, out: &mut String) {
    let kind = node.get("kind").and_then(Value::as_str).unwrap_or("");
    if kind == "text" || kind == "codeSpan" {
        if let Some(v) = node.get("value").and_then(Value::as_str) {
            out.push_str(v);
        }
        // Leaves: no children to recurse into (defensive: even if present,
        // the value already carries the full text for these kinds).
        return;
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            flatten_text_into(child, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi;

    #[test]
    fn outline_words_and_read_minutes() {
        let ast = ffi::parse("# Title\n\nsome words here\n\n## Sub Head\n\nmore\n").unwrap();
        let model = analyze(&ast).unwrap();

        assert_eq!(
            model.outline,
            vec![
                OutlineItem { level: 1, text: "Title".into(), line: 1 },
                OutlineItem { level: 2, text: "Sub Head".into(), line: 5 },
            ]
        );
        // Whitespace-split tokens over every `text` node's value, headings
        // included: Title, some, words, here, Sub, Head, more.
        assert_eq!(model.words, 7, "documented rule: {model:?}");
        assert_eq!(model.read_minutes, 1);
    }

    #[test]
    fn heading_text_flattens_inline_emphasis_and_code() {
        let ast = ffi::parse("# A *b* `c`\n").unwrap();
        let model = analyze(&ast).unwrap();

        assert_eq!(model.outline.len(), 1);
        assert_eq!(model.outline[0].text, "A b c");
    }

    #[test]
    fn empty_document_has_empty_outline_and_minimum_read_time() {
        let ast = ffi::parse("").unwrap();
        let model = analyze(&ast).unwrap();

        assert!(model.outline.is_empty());
        assert_eq!(model.words, 0);
        assert_eq!(model.read_minutes, 1, "read time floors at 1 minute");
    }
}
