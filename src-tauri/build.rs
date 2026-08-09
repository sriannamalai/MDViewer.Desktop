use std::env;
use std::path::PathBuf;

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
        _ => {}
    }
    tauri_build::build();
}
