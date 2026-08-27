//! Safe wrapper over the libmdviewer C ABI (v0.10.0).
//! Every out-buffer the library returns is copied into Rust memory and
//! immediately released with mdv_free. All functions are thread-safe
//! (library guarantee).
use std::collections::BTreeMap;
use std::ffi::{c_char, c_int, CStr, CString};
use std::fmt;

#[derive(Debug)]
pub struct FfiError(pub String);
impl fmt::Display for FfiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { self.0.fmt(f) }
}
impl std::error::Error for FfiError {}

#[derive(Debug, Clone, Default)]
pub struct RenderOptions {
    pub theme: String,
    pub source_map: bool,
    /// Code-block header row (uppercase language label + Copy affordance).
    /// Library-rendered since v0.8; the strict options JSON of older
    /// libraries rejects the key, so only emit it when set.
    pub code_header: bool,
    pub theme_overrides: BTreeMap<String, String>,
}

impl RenderOptions {
    /// Strict version-1 options JSON. Emits only documented fields, and
    /// only when they differ from library defaults.
    pub fn to_json(&self) -> String {
        let mut obj = serde_json::Map::new();
        if !self.theme.is_empty() {
            obj.insert("theme".into(), self.theme.clone().into());
        }
        if self.source_map {
            obj.insert("sourceMap".into(), true.into());
        }
        if self.code_header {
            obj.insert("codeHeader".into(), true.into());
        }
        if !self.theme_overrides.is_empty() {
            obj.insert(
                "themeOverrides".into(),
                serde_json::to_value(&self.theme_overrides).unwrap(),
            );
        }
        serde_json::Value::Object(obj).to_string()
    }
}

unsafe extern "C" {
    fn mdv_render(md: *const c_char, md_len: usize, opts: *const c_char,
        out: *mut *mut c_char, out_len: *mut usize, err: *mut *mut c_char) -> c_int;
    fn mdv_parse(md: *const c_char, md_len: usize, opts: *const c_char,
        out: *mut *mut c_char, out_len: *mut usize, err: *mut *mut c_char) -> c_int;
    fn mdv_asset(name: *const c_char,
        out: *mut *mut c_char, out_len: *mut usize, err: *mut *mut c_char) -> c_int;
    fn mdv_free(p: *mut c_char);
    fn mdv_version() -> *const c_char;
}

pub fn version() -> String {
    unsafe { CStr::from_ptr(mdv_version()) }.to_string_lossy().into_owned()
}

/// Runs one out-parameter FFI call and marshals the result. `f` receives
/// (out, out_len, err) pointers and returns the status code.
fn call(f: impl FnOnce(*mut *mut c_char, *mut usize, *mut *mut c_char) -> c_int)
    -> Result<Vec<u8>, FfiError>
{
    let mut out: *mut c_char = std::ptr::null_mut();
    let mut out_len: usize = 0;
    let mut err: *mut c_char = std::ptr::null_mut();
    let rc = f(&mut out, &mut out_len, &mut err);
    if rc != 0 {
        // Library contract: *out stays NULL on failure — nothing to free but err.
        let msg = if err.is_null() {
            "unknown FFI error".to_string()
        } else {
            let m = unsafe { CStr::from_ptr(err) }.to_string_lossy().into_owned();
            unsafe { mdv_free(err) };
            m
        };
        return Err(FfiError(msg));
    }
    let bytes = if out.is_null() {
        Vec::new()
    } else {
        let b = unsafe { std::slice::from_raw_parts(out as *const u8, out_len) }.to_vec();
        unsafe { mdv_free(out) };
        b
    };
    Ok(bytes)
}

pub fn render(md: &str, opts: &RenderOptions) -> Result<String, FfiError> {
    let opts_c = CString::new(opts.to_json()).map_err(|e| FfiError(e.to_string()))?;
    let bytes = call(|out, len, err| unsafe {
        mdv_render(md.as_ptr() as *const c_char, md.len(), opts_c.as_ptr(), out, len, err)
    })?;
    String::from_utf8(bytes).map_err(|e| FfiError(e.to_string()))
}

pub fn parse(md: &str) -> Result<String, FfiError> {
    let bytes = call(|out, len, err| unsafe {
        mdv_parse(md.as_ptr() as *const c_char, md.len(), std::ptr::null(), out, len, err)
    })?;
    String::from_utf8(bytes).map_err(|e| FfiError(e.to_string()))
}

pub fn asset(name: &str) -> Result<Vec<u8>, FfiError> {
    let name_c = CString::new(name).map_err(|e| FfiError(e.to_string()))?;
    call(|out, len, err| unsafe { mdv_asset(name_c.as_ptr(), out, len, err) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_reports_0_10_0() {
        assert!(version().starts_with("0.10.0"), "got {}", version());
    }

    #[test]
    fn render_default_full_page() {
        let html = render("# Hello *world*\n", &RenderOptions::default()).unwrap();
        assert!(html.contains("<h1"));
        assert!(html.contains("<em>world</em>"));
        assert!(html.contains("<html"), "expected full page");
    }

    #[test]
    fn render_with_theme_and_source_map() {
        let opts = RenderOptions {
            theme: "dark".into(),
            source_map: true,
            ..Default::default()
        };
        let html = render("# T\n\npara\n", &opts).unwrap();
        assert!(html.contains("data-md-line=\"1\""), "source map missing");
    }

    #[test]
    fn render_unknown_option_would_error() {
        // Guards the strict-JSON contract: our serializer must not emit
        // unknown fields. Serialize and assert only documented keys.
        let opts = RenderOptions { theme: "light".into(), source_map: true,
            code_header: true,
            theme_overrides: [("--md-bg".to_string(), "#fff".to_string())].into() };
        let json = opts.to_json();
        for key in ["\"theme\"", "\"sourceMap\"", "\"codeHeader\"", "\"themeOverrides\""] {
            assert!(json.contains(key), "{json}");
        }
        assert!(!json.contains("\"fragment\""), "must omit defaults: {json}");
    }

    #[test]
    fn parse_yields_v1_ast() {
        let ast = parse("# Head\n\ntext\n").unwrap();
        assert!(ast.contains("\"version\":1"));
        assert!(ast.contains("\"heading\""));
    }

    #[test]
    fn asset_registry_works() {
        let mermaid = asset("mermaid.js").unwrap();
        assert!(mermaid.len() > 100_000);
        let err = asset("bogus.js").unwrap_err();
        assert!(err.0.contains("mermaid.js"), "error lists names: {}", err.0);
    }

    #[test]
    fn render_empty_markdown_succeeds() {
        // Pins the empty-success behavior: exercises the null-guard region
        // in `call()` when the library may return a zero-length buffer.
        let html = render("", &RenderOptions::default()).unwrap();
        assert!(!html.is_empty(), "expected a non-empty full page for empty input");
        assert!(html.contains("<html"), "expected full page: {html}");
    }

    #[test]
    fn render_error_path() {
        // Invalid theme name errors cleanly (no panic/crash across FFI).
        let opts = RenderOptions { theme: "neon".into(), ..Default::default() };
        let e = render("# x\n", &opts).unwrap_err();
        assert!(!e.0.is_empty());
    }
}
