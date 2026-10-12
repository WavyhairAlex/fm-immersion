use std::{env, fs, path::Path};

/// Embarque les migrations SQL générées par drizzle-kit (packages/db) dans l'exécutable.
/// L'ordre est celui des noms de fichiers (0000_…, 0001_…) : ne jamais renommer ni
/// modifier une migration déjà publiée, en ajouter une nouvelle.
fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let dir = Path::new(&manifest_dir).join("migrations");
    println!("cargo:rerun-if-changed={}", dir.display());

    let mut files: Vec<_> = fs::read_dir(&dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|ext| ext == "sql"))
                .collect()
        })
        .unwrap_or_default();
    files.sort();

    let mut code = String::from("pub const MIGRATIONS: &[(&str, &str)] = &[\n");
    for path in &files {
        let name = path.file_name().unwrap().to_string_lossy();
        code.push_str(&format!(
            "    ({:?}, include_str!({:?})),\n",
            name,
            path.to_string_lossy()
        ));
    }
    code.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("migrations.rs"), code).unwrap();

    tauri_build::build()
}
