use crate::model::RunSummary;
use rusqlite::{params, Connection};
use std::path::Path;
pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?
    }
    let c = Connection::open(path).map_err(|e| e.to_string())?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,company TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,stars INTEGER,result_json TEXT,error TEXT,workspace TEXT NOT NULL,job_json TEXT NOT NULL);").map_err(|e|e.to_string())?;
    let _ = c.execute(
        "ALTER TABLE runs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
        [],
    );
    Ok(c)
}
pub fn recover_interrupted(c: &Connection) -> Result<(), String> {
    c.execute("UPDATE runs SET status='Failed',error='Run was interrupted when RoleTailor closed' WHERE status NOT IN ('Completed','Failed','Cancelled','Draft')", []).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn setting(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
        r.get(0)
    })
    .ok()
}
pub fn set_setting(c: &Connection, key: &str, value: &str) -> Result<(), String> {
    c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value]).map_err(|e|e.to_string())?;
    Ok(())
}
pub fn insert_run(
    c: &Connection,
    r: &RunSummary,
    workspace: &str,
    job: &serde_json::Value,
) -> Result<(), String> {
    c.execute("INSERT INTO runs(id,company,role,status,created_at,workspace,job_json)VALUES(?,?,?,?,?,?,?)",params![r.id,r.company,r.role,r.status,r.created_at,workspace,job.to_string()]).map_err(|e|e.to_string())?;
    Ok(())
}
pub fn update_run(
    c: &Connection,
    id: &str,
    status: &str,
    result: Option<&serde_json::Value>,
    error: Option<&str>,
) -> Result<(), String> {
    let stars = result
        .and_then(|v| v.pointer("/fit/stars"))
        .and_then(|v| v.as_u64());
    c.execute(
        "UPDATE runs SET status=?,stars=?,result_json=?,error=? WHERE id=?",
        params![status, stars, result.map(|v| v.to_string()), error, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
fn list_with_archived(c: &Connection, archived: bool) -> Result<Vec<RunSummary>, String> {
    let mut q=c.prepare("SELECT id,company,role,status,created_at,stars,result_json,error,archived FROM runs WHERE archived=? ORDER BY created_at DESC").map_err(|e|e.to_string())?;
    let rows = q
        .query_map([archived as i64], |r| {
            let json: Option<String> = r.get(6)?;
            Ok(RunSummary {
                id: r.get(0)?,
                company: r.get(1)?,
                role: r.get(2)?,
                status: r.get(3)?,
                created_at: r.get(4)?,
                stars: r.get(5)?,
                result: json.and_then(|x| serde_json::from_str(&x).ok()),
                error: r.get(7)?,
                archived: r.get::<_, i64>(8)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list(c: &Connection) -> Result<Vec<RunSummary>, String> {
    list_with_archived(c, false)
}

pub fn list_archived(c: &Connection) -> Result<Vec<RunSummary>, String> {
    list_with_archived(c, true)
}

pub fn set_archived(c: &Connection, id: &str, archived: bool) -> Result<(), String> {
    let changed = c
        .execute(
            "UPDATE runs SET archived=? WHERE id=? AND status='Completed'",
            params![archived as i64, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Only a completed saved application can be archived".into());
    }
    Ok(())
}
pub fn workspace(c: &Connection, id: &str) -> Option<String> {
    c.query_row("SELECT workspace FROM runs WHERE id=?", [id], |r| r.get(0))
        .ok()
}

pub fn result(c: &Connection, id: &str) -> Option<serde_json::Value> {
    c.query_row("SELECT result_json FROM runs WHERE id=?", [id], |row| {
        row.get::<_, Option<String>>(0)
    })
    .ok()
    .flatten()
    .and_then(|value| serde_json::from_str(&value).ok())
}

pub fn delete_run(c: &Connection, id: &str) -> Result<(), String> {
    c.execute("DELETE FROM runs WHERE id=?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn completed_runs_can_move_to_and_from_archive() {
        let path = std::env::temp_dir().join(format!("roletailor-db-{}.sqlite3", Uuid::new_v4()));
        let connection = open(&path).unwrap();
        let run = RunSummary {
            id: "run-1".into(),
            company: "Acme".into(),
            role: "Developer".into(),
            status: "Completed".into(),
            created_at: Utc::now().to_rfc3339(),
            stars: Some(4),
            result: None,
            error: None,
            archived: false,
        };
        insert_run(&connection, &run, "/tmp/workspace", &serde_json::json!({})).unwrap();
        set_archived(&connection, "run-1", true).unwrap();
        assert!(list(&connection).unwrap().is_empty());
        assert_eq!(list_archived(&connection).unwrap().len(), 1);
        set_archived(&connection, "run-1", false).unwrap();
        assert_eq!(list(&connection).unwrap().len(), 1);
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }
}
