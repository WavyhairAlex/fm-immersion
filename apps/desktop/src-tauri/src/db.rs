//! Accès à la base SQLite locale.
//!
//! Le schéma est décrit en TypeScript (Drizzle, packages/db) et les requêtes sont
//! construites côté interface. Rust se contente de les exécuter et de renvoyer les
//! lignes sous forme de tableaux, ce qu'attend le pilote `sqlite-proxy` de Drizzle.
//! L'interface est notre propre code embarqué (aucun contenu distant), d'où ce choix.

use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value as Json;
use std::{path::Path, sync::Mutex};

include!(concat!(env!("OUT_DIR"), "/migrations.rs"));

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("base de données indisponible")]
    Poisoned,
}

impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type Rows = Vec<Vec<Json>>;

#[derive(Debug, Deserialize)]
pub struct Query {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(path)?;
    configure(&mut conn)?;
    Ok(conn)
}

fn configure(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(conn)
}

/// Applique les migrations manquantes. `user_version` retient la dernière appliquée.
pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: usize = conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize;
    for (index, (_name, sql)) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (index + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

fn to_sql(value: &Json) -> SqlValue {
    match value {
        Json::Null => SqlValue::Null,
        Json::Bool(b) => SqlValue::Integer(*b as i64),
        Json::Number(n) => n
            .as_i64()
            .map(SqlValue::Integer)
            .unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Json::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn to_json(value: SqlValue) -> Json {
    match value {
        SqlValue::Null => Json::Null,
        SqlValue::Integer(i) => Json::from(i),
        SqlValue::Real(f) => serde_json::Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        SqlValue::Text(s) => Json::String(s),
        SqlValue::Blob(b) => Json::from(b),
    }
}

/// Exécute une requête et renvoie ses lignes (vide pour une écriture sans RETURNING).
pub fn run_query(conn: &Connection, query: &Query) -> Result<Rows, DbError> {
    let mut stmt = conn.prepare_cached(&query.sql)?;
    let params = params_from_iter(query.params.iter().map(to_sql));
    if stmt.column_count() == 0 {
        stmt.execute(params)?;
        return Ok(Vec::new());
    }
    let width = stmt.column_count();
    let mut rows = stmt.query(params)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut values = Vec::with_capacity(width);
        for i in 0..width {
            values.push(to_json(row.get::<_, SqlValue>(i)?));
        }
        out.push(values);
    }
    Ok(out)
}

#[tauri::command]
pub fn db_query(state: tauri::State<'_, Db>, sql: String, params: Vec<Json>) -> Result<Rows, DbError> {
    let conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    run_query(&conn, &Query { sql, params })
}

/// Plusieurs requêtes dans une seule transaction : tout passe ou rien.
#[tauri::command]
pub fn db_batch(state: tauri::State<'_, Db>, queries: Vec<Query>) -> Result<Vec<Rows>, DbError> {
    let mut conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    let tx = conn.transaction()?;
    let results = queries.iter().map(|q| run_query(&tx, q)).collect::<Result<Vec<_>, _>>()?;
    tx.commit()?;
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        configure(&mut conn).unwrap();
        conn
    }

    fn q(sql: &str, params: Vec<Json>) -> Query {
        Query { sql: sql.into(), params }
    }

    #[test]
    fn applique_les_migrations_une_seule_fois() {
        let mut conn = memory_db();
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(version as usize, MIGRATIONS.len());
        migrate(&mut conn).unwrap();
        let rows = run_query(&conn, &q("select count(*) from saves", vec![])).unwrap();
        assert_eq!(rows, vec![vec![json!(0)]]);
    }

    #[test]
    fn ecrit_et_relit_une_partie_dans_l_ordre_des_colonnes() {
        let conn = memory_db();
        let insert = q(
            "insert into saves (id, game_id, name, game_version, extra, created_at, updated_at) \
             values (?, ?, ?, ?, ?, ?, ?) returning id, name, game_version",
            vec![
                json!("a1"),
                json!("tf3"),
                json!("Europe 1850"),
                Json::Null,
                json!("{}"),
                json!("2026-10-12T00:00:00Z"),
                json!("2026-10-12T00:00:00Z"),
            ],
        );
        let returned = run_query(&conn, &insert).unwrap();
        assert_eq!(returned, vec![vec![json!("a1"), json!("Europe 1850"), Json::Null]]);

        let rows = run_query(&conn, &q("select name, 1.5, x'00ff' from saves where id = ?", vec![json!("a1")])).unwrap();
        assert_eq!(rows, vec![vec![json!("Europe 1850"), json!(1.5), json!([0, 255])]]);
    }

    #[test]
    fn une_ecriture_sans_returning_ne_renvoie_rien() {
        let conn = memory_db();
        let rows = run_query(&conn, &q("create table t (x integer)", vec![])).unwrap();
        assert!(rows.is_empty());
        let rows = run_query(&conn, &q("insert into t values (?)", vec![json!(true)])).unwrap();
        assert!(rows.is_empty());
        let rows = run_query(&conn, &q("select x from t", vec![])).unwrap();
        assert_eq!(rows, vec![vec![json!(1)]]);
    }
}
