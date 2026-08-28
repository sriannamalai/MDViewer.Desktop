use std::env;
use std::path::{Path, PathBuf};

fn main() {
    let target = match (
        env::var("CARGO_CFG_TARGET_OS").as_deref(),
        env::var("CARGO_CFG_TARGET_ARCH").as_deref(),
    ) {
        (Ok("macos"), Ok("aarch64")) => "darwin-arm64",
        (Ok("macos"), Ok("x86_64")) => "darwin-amd64",
        (Ok("linux"), Ok("x86_64")) => "linux-amd64",
        (Ok("linux"), Ok("aarch64")) => "linux-arm64",
        (Ok("windows"), Ok("x86_64")) => "windows-amd64",
        // Additional CI build-matrix target (multi-arch bundling item) —
        // libmdviewer's own release-ffi.yml doesn't publish this target
        // yet either, so `vendor/libmdviewer/windows-arm64` won't exist
        // until it does; see scripts/update-checksums.sh and AGENTS.md.
        (Ok("windows"), Ok("aarch64")) => "windows-arm64",
        (os, arch) => panic!("unsupported target {:?}-{:?}", os, arch),
    };
    let vendor = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("..")
        .join("vendor/libmdviewer")
        .join(target)
        .canonicalize()
        .unwrap_or_else(|_| panic!("vendor/libmdviewer/{target} missing — run scripts/fetch-libmdviewer.sh"));
    println!("cargo:rustc-link-search=native={}", vendor.display());
    println!("cargo:rustc-link-lib=dylib=mdviewer");
    // Dev/test binaries resolve via the vendor dir; bundled apps via
    // Contents/Frameworks (Task 8 copies the dylib there).
    #[allow(clippy::single_match)]
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => {
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", vendor.display());
            println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
        }
        Ok("linux") => {
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", vendor.display());
            println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
        }
        Ok("windows") => {
            ensure_msvc_import_lib(&vendor, &env::var("TARGET").unwrap());
            copy_dll_for_runtime(&vendor);
        }
        _ => {}
    }
    tauri_build::build();
}

/// `cargo:rustc-link-lib=dylib=mdviewer` above needs `link.exe` to find an
/// import library (`mdviewer.lib`) alongside the DLL at link time — that's
/// how MSVC resolves symbols against a shared library, unlike GNU
/// toolchains, which can link straight against a bare `.dll`. But
/// `libmdviewer`'s Go toolchain (`go build -buildmode=c-shared`) only ever
/// produces the `.dll` and a C header, never an MSVC `.lib` (this is a
/// long-standing Go cgo limitation, not a fetch-script bug), which is
/// exactly why the windows-amd64 job started failing with `LNK1181: cannot
/// open input file 'mdviewer.lib'` the moment CI first exercised this
/// target (Desktop was macOS-only before this).
///
/// This synthesizes that missing import library once (cached in the
/// vendor dir alongside the `.dll`, which is itself git-ignored /
/// fetch-script-managed, so nothing here needs to be committed) using the
/// same dumpbin-then-lib.exe dance Microsoft's own docs recommend for
/// linking against a DLL-only distribution: `dumpbin /exports` lists the
/// DLL's exported symbols, which get written to a `.def` file that
/// `lib.exe /DEF:...` turns into a proper `.lib`. Both tools are located
/// via `cc`'s MSVC-registry probing (the same mechanism cargo/rustc
/// themselves use to find `link.exe`), so this works on a bare
/// `windows-latest` runner without requiring a "Developer Command Prompt"
/// / `vcvarsall.bat` environment to already be active.
fn ensure_msvc_import_lib(vendor: &Path, rust_target: &str) {
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("msvc") {
        return; // GNU-toolchain Windows targets link against the bare .dll directly.
    }
    // `libmdviewer`'s build-ffi.sh names every platform's artifact
    // `libmdviewer.<ext>` (`libmdviewer.dylib`/`.so`/`.dll`) — but Rust's
    // `rustc-link-lib=dylib=mdviewer` directive (above) asks MSVC's linker
    // for exactly `mdviewer.lib`, with no `lib` prefix (Unix linkers
    // auto-prepend `lib` for a bare `-l name`; MSVC's do not). The DLL to
    // read exports from is still the real `libmdviewer.dll`; only the
    // generated import library needs the prefix-less `mdviewer.lib` name
    // Rust is going to look for. lib.exe's `.def` file controls the
    // runtime-loaded module name independently of the `.lib`'s own
    // filename on disk, so `mdviewer.lib` can correctly point at
    // `libmdviewer.dll` at runtime — see the `LIBRARY` line below.
    let dll = vendor.join("libmdviewer.dll");
    let lib = vendor.join("mdviewer.lib");
    if lib.exists() || !dll.exists() {
        // No .dll (or already generated): either the fetch script hasn't
        // run yet — the link step below will fail with its own clearer
        // "cannot open input file" — or a previous build already did this.
        return;
    }

    let dumpbin = cc::windows_registry::find_tool(rust_target, "dumpbin.exe").unwrap_or_else(|| {
        panic!(
            "dumpbin.exe not found for {rust_target} — install the MSVC Build Tools (or run from \
             a Developer Command Prompt) so an import library can be generated for {}",
            dll.display()
        )
    });
    let output = dumpbin
        .to_command()
        .arg("/exports")
        .arg(&dll)
        .output()
        .unwrap_or_else(|e| panic!("failed to run dumpbin /exports on {}: {e}", dll.display()));
    if !output.status.success() {
        panic!(
            "dumpbin /exports {} failed:\n{}",
            dll.display(),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let exports = parse_dumpbin_exports(&stdout);
    if exports.is_empty() {
        // Include the raw output so a CI failure is immediately diagnosable
        // instead of requiring another round trip to see what dumpbin
        // actually printed.
        panic!(
            "dumpbin reported no exports for {} — cannot generate an import library.\n--- dumpbin /exports output ---\n{}\n--- end output ---",
            dll.display(),
            stdout
        );
    }

    let def_path = vendor.join("mdviewer.def");
    // `LIBRARY libmdviewer.dll` (not `mdviewer`/`mdviewer.dll`) is what
    // actually matters here: it's embedded in the generated `.lib` as the
    // module name the OS loader will request at runtime, and must match
    // the real DLL's filename on disk regardless of what the `.lib` file
    // itself is named.
    let mut def = String::from("LIBRARY libmdviewer.dll\nEXPORTS\n");
    for name in &exports {
        def.push_str(name);
        def.push('\n');
    }
    std::fs::write(&def_path, &def).unwrap_or_else(|e| panic!("failed to write {}: {e}", def_path.display()));

    let lib_tool = cc::windows_registry::find_tool(rust_target, "lib.exe")
        .unwrap_or_else(|| panic!("lib.exe not found for {rust_target} — install the MSVC Build Tools"));
    let machine = if rust_target.starts_with("aarch64") { "ARM64" } else { "X64" };
    let status = lib_tool
        .to_command()
        .arg(format!("/DEF:{}", def_path.display()))
        .arg(format!("/OUT:{}", lib.display()))
        .arg(format!("/MACHINE:{machine}"))
        .status()
        .unwrap_or_else(|e| panic!("failed to run lib.exe: {e}"));
    if !status.success() {
        panic!("lib.exe /DEF:{} failed", def_path.display());
    }
    println!("cargo:warning=generated {} from {} ({} exported symbols)", lib.display(), dll.display(), exports.len());
}

/// The generated `mdviewer.lib` above only satisfies the *linker*; at
/// *runtime* Windows still needs to find `libmdviewer.dll` itself via its
/// normal DLL search order (which checks the loading executable's own
/// directory first — there's no Windows equivalent of an ELF/Mach-O rpath
/// embeddable at link time the way macOS/Linux do it above). Copying the
/// DLL next to every place cargo puts a binary that links against it
/// covers `cargo build`/`cargo tauri dev` (`target/<profile>/`) and
/// `cargo test` (`target/<profile>/deps/`); the packaged installer's copy
/// is handled separately via `tauri.windows.conf.json`'s `bundle.resources`.
fn copy_dll_for_runtime(vendor: &Path) {
    let dll = vendor.join("libmdviewer.dll");
    if !dll.exists() {
        return;
    }
    // OUT_DIR is target/<profile>/build/<pkg>-<hash>/out; its great-great-
    // grandparent is target/<profile>, where cargo places the main
    // binary, and .../deps holds cargo test's own binaries.
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let Some(profile_dir) = out_dir.ancestors().nth(3) else { return };
    for dest_dir in [profile_dir.to_path_buf(), profile_dir.join("deps")] {
        let _ = std::fs::create_dir_all(&dest_dir);
        let _ = std::fs::copy(&dll, dest_dir.join("libmdviewer.dll"));
    }
}

/// Parses `dumpbin /exports` output down to just the exported symbol
/// names. The table looks like:
/// ```text
///     ordinal hint RVA      name
///
///           1    0 00001060 mdv_asset
///           2    1 00001070 mdv_free
///
///   Summary
/// ```
/// Note the *blank line between the header and the first row* — the table
/// doesn't truly end until the next blank line *after* at least one row
/// has been read (confirmed against real dumpbin output in CI: stopping
/// at the first blank line unconditionally, as an earlier version of this
/// function did, matched the header's own trailing blank line and never
/// read a single row).
fn parse_dumpbin_exports(output: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut in_table = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if !in_table {
            if trimmed.starts_with("ordinal") && trimmed.contains("name") {
                in_table = true;
            }
            continue;
        }
        if trimmed.is_empty() {
            if names.is_empty() {
                continue; // the blank line between the header and the first row
            }
            break; // the blank line after the last row
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if let Some(name) = parts.get(3)
            && name.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        {
            names.push((*name).to_string());
        }
    }
    names
}

// No #[cfg(test)] module here: `cargo test` doesn't execute a crate's
// build-script (`build.rs` is its own separate compilation unit, not part
// of `--lib`/`--bins`/`--tests`), so unit tests placed here would never
// actually run in CI. `parse_dumpbin_exports` was verified by hand against
// a real `dumpbin /exports` sample instead; the windows-amd64 CI job's
// first real run against actual dumpbin output is the true test.
