use crate::models::*;
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};

pub const COMPONENT_COLUMNS: &str = "id, name, category, package, value, quantity, min_quantity, location, notes, unit_price, created_at, updated_at, deleted_at";
pub const UPSERT_COMPONENT: &str = "INSERT INTO components (id,name,category,package,value,quantity,min_quantity,location,notes,unit_price,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,package=excluded.package,value=excluded.value,quantity=excluded.quantity,min_quantity=excluded.min_quantity,location=excluded.location,notes=excluded.notes,unit_price=excluded.unit_price,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
pub const BOX_COLUMNS: &str = "id, label, subtitle, created_at, updated_at, deleted_at";
pub const UPSERT_BOX: &str = "INSERT INTO storage_boxes (id,label,subtitle,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,subtitle=excluded.subtitle,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";
pub const PROJECT_COLUMNS: &str = "id,name,description,file_name,rows_json,completed_json,status,start_date,created_at,updated_at,deleted_at";
pub const UPSERT_PROJECT: &str = "INSERT INTO bom_projects (id,name,description,file_name,rows_json,completed_json,status,start_date,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,file_name=excluded.file_name,rows_json=excluded.rows_json,completed_json=excluded.completed_json,status=excluded.status,start_date=excluded.start_date,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at";

pub fn initialize(conn: &mut Connection) -> Result<(), String> {
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(db_error)?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .map_err(db_error)?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(db_error)?;
    if version > 4 {
        return Err("本地数据库版本较新，请升级 Retos。".into());
    }
    if version == 0 {
        let tx = conn.transaction().map_err(db_error)?;
        tx.execute_batch(include_str!("../../scripts/d1-schema.sql"))
            .map_err(db_error)?;
        tx.execute_batch(
            "ALTER TABLE components ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE stock_movements ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE storage_boxes ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
            CREATE TABLE local_settings (key TEXT PRIMARY KEY, value BLOB NOT NULL);
            PRAGMA user_version=4;",
        )
        .map_err(db_error)?;
        tx.commit().map_err(db_error)?;
    }
    if version == 1 {
        let tx = conn.transaction().map_err(db_error)?;
        tx.execute_batch(include_str!(
            "../../scripts/d1-migration-004-storage-boxes.sql"
        ))
        .map_err(db_error)?;
        tx.execute_batch(
            "ALTER TABLE storage_boxes ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
             PRAGMA user_version=2;",
        )
        .map_err(db_error)?;
        tx.commit().map_err(db_error)?;
    }
    if version <= 2 {
        conn.execute_batch(include_str!(
            "../../scripts/d1-migration-005-bom-projects.sql"
        ))
        .map_err(db_error)?;
    }
    if version <= 3 {
        let has_start_date = conn
            .prepare("PRAGMA table_info(bom_projects)")
            .map_err(db_error)?
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?
            .iter()
            .any(|name| name == "start_date");
        if !has_start_date {
            conn.execute_batch(include_str!(
                "../../scripts/d1-migration-006-bom-start-date.sql"
            ))
            .map_err(db_error)?;
        }
        conn.execute_batch("PRAGMA user_version=4;")
            .map_err(db_error)?;
    }
    conn.execute_batch("ALTER TABLE bom_projects ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;")
        .or_else(|error| {
            if error.to_string().contains("duplicate column name") {
                Ok(())
            } else {
                Err(error)
            }
        })
        .map_err(db_error)?;
    conn.execute_batch("INSERT OR IGNORE INTO storage_boxes (id,label,subtitle) VALUES ('A','盒 01','电阻 / 电容'),('B','盒 02','二极管 / 连接器'),('C','盒 03','芯片 / 模块');")
        .map_err(db_error)?;
    Ok(())
}

pub fn db_error(error: rusqlite::Error) -> String {
    format!("本地数据库操作失败：{error}")
}

pub fn timestamp(value: &str) -> Result<i64, String> {
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Ok(date.timestamp_millis());
    }
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f")
        .map(|d| d.and_utc().timestamp_millis())
        .map_err(|_| "数据库中存在无效时间。".into())
}

pub fn next_timestamp(previous: Option<&str>) -> Result<String, String> {
    let previous = previous.map(timestamp).transpose()?.unwrap_or(0);
    let millis = Utc::now().timestamp_millis().max(previous + 1);
    Ok(DateTime::from_timestamp_millis(millis)
        .ok_or("无效的更新时间。")?
        .to_rfc3339_opts(SecondsFormat::Millis, true))
}

pub fn component_row(row: &Row<'_>) -> rusqlite::Result<Component> {
    Ok(Component {
        id: row.get(0)?,
        name: row.get(1)?,
        category: row.get(2)?,
        package: row.get(3)?,
        value: row.get(4)?,
        quantity: row.get(5)?,
        min_quantity: row.get(6)?,
        location: row.get(7)?,
        notes: row.get(8)?,
        unit_price: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

pub fn get_component(conn: &Connection, id: &str) -> Result<Option<Component>, String> {
    conn.query_row(
        &format!("SELECT {COMPONENT_COLUMNS} FROM components WHERE id=?"),
        [id],
        component_row,
    )
    .optional()
    .map_err(db_error)
}

pub fn components(conn: &Connection, dirty_only: bool) -> Result<Vec<Component>, String> {
    let suffix = if dirty_only {
        "WHERE dirty=1 OR id IN (SELECT component_id FROM stock_movements WHERE dirty=1)"
    } else {
        "WHERE deleted_at IS NULL"
    };
    conn.prepare(&format!(
        "SELECT {COMPONENT_COLUMNS} FROM components {suffix} ORDER BY name COLLATE NOCASE"
    ))
    .map_err(db_error)?
    .query_map([], component_row)
    .map_err(db_error)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(db_error)
}

pub fn movements(conn: &Connection, dirty_only: bool) -> Result<Vec<Movement>, String> {
    let suffix = if dirty_only {
        "WHERE m.dirty=1"
    } else {
        "WHERE c.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 50"
    };
    conn.prepare(&format!("SELECT m.id,m.component_id,m.type,m.quantity,m.note,m.created_at,c.name || ' · ' || c.value FROM stock_movements m JOIN components c ON c.id=m.component_id {suffix}")).map_err(db_error)?
        .query_map([], |r| Ok(Movement { id: r.get(0)?, component_id: r.get(1)?, kind: r.get(2)?, quantity: r.get(3)?, note: r.get(4)?, created_at: r.get(5)?, component_name: r.get(6)? })).map_err(db_error)?
        .collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn storage_boxes(conn: &Connection, dirty_only: bool) -> Result<Vec<StorageBox>, String> {
    let suffix = if dirty_only {
        "WHERE dirty=1"
    } else {
        "WHERE deleted_at IS NULL ORDER BY id"
    };
    conn.prepare(&format!("SELECT {BOX_COLUMNS} FROM storage_boxes {suffix}"))
        .map_err(db_error)?
        .query_map([], |r| {
            Ok(StorageBox {
                id: r.get(0)?,
                label: r.get(1)?,
                subtitle: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                deleted_at: r.get(5)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)
}

fn project_row(r: &Row<'_>) -> rusqlite::Result<BomProject> {
    Ok(BomProject {
        id: r.get(0)?,
        name: r.get(1)?,
        description: r.get(2)?,
        file_name: r.get(3)?,
        rows_json: r.get(4)?,
        completed_json: r.get(5)?,
        status: r.get(6)?,
        start_date: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        deleted_at: r.get(10)?,
    })
}

pub fn bom_projects(conn: &Connection, dirty_only: bool) -> Result<Vec<BomProject>, String> {
    let suffix = if dirty_only {
        "WHERE dirty=1"
    } else {
        "WHERE deleted_at IS NULL ORDER BY updated_at DESC"
    };
    conn.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM bom_projects {suffix}"
    ))
    .map_err(db_error)?
    .query_map([], project_row)
    .map_err(db_error)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(db_error)
}

pub fn put_bom_project(conn: &Connection, p: &BomProject) -> Result<(), String> {
    conn.execute(
        UPSERT_PROJECT,
        params![
            p.id,
            p.name,
            p.description,
            p.file_name,
            p.rows_json,
            p.completed_json,
            p.status,
            p.start_date,
            p.created_at,
            p.updated_at,
            p.deleted_at
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn create_bom_project(conn: &mut Connection, input: BomProjectInput) -> Result<(), String> {
    if input.name.trim().is_empty()
        || input.name.len() > 120
        || input.description.len() > 1000
        || !input.file_name.to_lowercase().ends_with(".csv")
        || input.rows_json.len() > 10_000_000
        || chrono::NaiveDate::parse_from_str(&input.start_date, "%Y-%m-%d").is_err()
    {
        return Err("请填写有效的项目名称和 BOM CSV。".into());
    }
    let rows: serde_json::Value =
        serde_json::from_str(&input.rows_json).map_err(|_| "BOM 数据无效。")?;
    if !rows.is_array()
        || rows
            .as_array()
            .is_some_and(|r| r.is_empty() || r.len() > 10_000)
    {
        return Err("BOM 数据无效。".into());
    }
    let now = next_timestamp(None)?;
    let project = BomProject {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().into(),
        description: input.description.trim().into(),
        file_name: input.file_name,
        rows_json: input.rows_json,
        completed_json: "[]".into(),
        status: "采购中".into(),
        start_date: input.start_date,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    };
    put_bom_project(conn, &project)?;
    conn.execute("UPDATE bom_projects SET dirty=1 WHERE id=?", [&project.id])
        .map_err(db_error)?;
    Ok(())
}

pub fn update_bom_project(
    conn: &mut Connection,
    id: &str,
    status: Option<String>,
    completed: Option<Vec<String>>,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let project = tx
        .query_row(
            &format!(
                "SELECT {PROJECT_COLUMNS} FROM bom_projects WHERE id=? AND deleted_at IS NULL"
            ),
            [id],
            project_row,
        )
        .optional()
        .map_err(db_error)?
        .ok_or("项目不存在。")?;
    if status
        .as_ref()
        .is_some_and(|s| !["采购中", "焊接中", "测试中", "完成"].contains(&s.as_str()))
    {
        return Err("无效的项目状态。".into());
    }
    if let Some(ids) = &completed {
        let rows: Vec<serde_json::Value> =
            serde_json::from_str(&project.rows_json).map_err(|_| "BOM 数据无效。")?;
        if ids
            .iter()
            .any(|id| !rows.iter().any(|r| r["id"].as_str() == Some(id)))
        {
            return Err("无效的 BOM 行。".into());
        }
    }
    let now = next_timestamp(Some(&project.updated_at))?;
    tx.execute(
        "UPDATE bom_projects SET status=?,completed_json=?,updated_at=?,dirty=1 WHERE id=?",
        params![
            status.unwrap_or(project.status),
            completed
                .map(|c| serde_json::to_string(&c).unwrap())
                .unwrap_or(project.completed_json),
            now,
            id
        ],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn update_bom_project_metadata(
    conn: &mut Connection,
    id: &str,
    name: &str,
    description: &str,
    start_date: &str,
) -> Result<(), String> {
    if name.trim().is_empty()
        || name.trim().len() > 120
        || description.len() > 1000
        || chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d").is_err()
    {
        return Err("请填写有效的项目名称、说明和开始日期。".into());
    }
    let tx = conn.transaction().map_err(db_error)?;
    let previous: String = tx
        .query_row(
            "SELECT updated_at FROM bom_projects WHERE id=? AND deleted_at IS NULL",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or("项目不存在。")?;
    let now = next_timestamp(Some(&previous))?;
    tx.execute(
        "UPDATE bom_projects SET name=?,description=?,start_date=?,updated_at=?,dirty=1 WHERE id=?",
        params![name.trim(), description.trim(), start_date, now, id],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn snapshot(conn: &Connection) -> Result<Snapshot, String> {
    Ok(Snapshot { components: components(conn, false)?, movements: movements(conn, false)?, boxes: storage_boxes(conn, false)?, projects: bom_projects(conn, false)?, pending: conn.query_row("SELECT (SELECT COUNT(*) FROM components WHERE dirty=1)+(SELECT COUNT(*) FROM stock_movements WHERE dirty=1)+(SELECT COUNT(*) FROM storage_boxes WHERE dirty=1)+(SELECT COUNT(*) FROM bom_projects WHERE dirty=1)", [], |r| r.get(0)).map_err(db_error)? })
}

pub fn put_component(conn: &Connection, c: &Component) -> Result<(), String> {
    conn.execute(
        UPSERT_COMPONENT,
        params![
            c.id,
            c.name,
            c.category,
            c.package,
            c.value,
            c.quantity,
            c.min_quantity,
            c.location,
            c.notes,
            c.unit_price,
            c.created_at,
            c.updated_at,
            c.deleted_at
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn put_storage_box(conn: &Connection, b: &StorageBox) -> Result<(), String> {
    conn.execute(
        UPSERT_BOX,
        params![
            b.id,
            b.label,
            b.subtitle,
            b.created_at,
            b.updated_at,
            b.deleted_at
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

pub fn save_storage_box(
    conn: &mut Connection,
    id: Option<String>,
    input: StorageBoxInput,
) -> Result<(), String> {
    input.validate()?;
    let tx = conn.transaction().map_err(db_error)?;
    let previous = if let Some(id) = &id {
        tx.query_row(
            &format!("SELECT {BOX_COLUMNS} FROM storage_boxes WHERE id=? AND deleted_at IS NULL"),
            [id],
            |r| {
                Ok(StorageBox {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    subtitle: r.get(2)?,
                    created_at: r.get(3)?,
                    updated_at: r.get(4)?,
                    deleted_at: r.get(5)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
    } else {
        None
    };
    let now = next_timestamp(previous.as_ref().map(|b| b.updated_at.as_str()))?;
    let storage_box = StorageBox {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        label: input.label.trim().into(),
        subtitle: input.subtitle.trim().into(),
        created_at: previous
            .as_ref()
            .map(|b| b.created_at.clone())
            .unwrap_or_else(|| now.clone()),
        updated_at: now,
        deleted_at: None,
    };
    put_storage_box(&tx, &storage_box)?;
    tx.execute(
        "UPDATE storage_boxes SET dirty=1 WHERE id=?",
        [&storage_box.id],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn delete_storage_box(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let current: StorageBox = tx
        .query_row(
            &format!("SELECT {BOX_COLUMNS} FROM storage_boxes WHERE id=? AND deleted_at IS NULL"),
            [id],
            |r| {
                Ok(StorageBox {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    subtitle: r.get(2)?,
                    created_at: r.get(3)?,
                    updated_at: r.get(4)?,
                    deleted_at: r.get(5)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or("收纳盒不存在。")?;
    let now = next_timestamp(Some(&current.updated_at))?;
    tx.execute(
        "UPDATE storage_boxes SET deleted_at=?,updated_at=?,dirty=1 WHERE id=?",
        params![now, now, id],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn save_component(
    conn: &mut Connection,
    id: Option<String>,
    input: ComponentInput,
) -> Result<(), String> {
    input.validate()?;
    let tx = conn.transaction().map_err(db_error)?;
    let previous = if let Some(id) = &id {
        Some(
            get_component(&tx, id)?
                .filter(|c| c.deleted_at.is_none())
                .ok_or("元件不存在或已删除。")?,
        )
    } else {
        None
    };
    let now = next_timestamp(previous.as_ref().map(|c| c.updated_at.as_str()))?;
    let component = Component {
        id: id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: input.name.trim().into(),
        category: input.category.trim().into(),
        package: input.package.trim().into(),
        value: input.value.trim().into(),
        quantity: input.quantity,
        min_quantity: input.min_quantity,
        location: input.location.trim().into(),
        notes: input.notes.trim().into(),
        unit_price: input.unit_price,
        created_at: previous
            .map(|c| c.created_at)
            .unwrap_or_else(|| now.clone()),
        updated_at: now,
        deleted_at: None,
    };
    put_component(&tx, &component)?;
    tx.execute("UPDATE components SET dirty=1 WHERE id=?", [&component.id])
        .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn delete_component(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let current = get_component(&tx, id)?.ok_or("元件不存在。")?;
    let now = next_timestamp(Some(&current.updated_at))?;
    tx.execute(
        "UPDATE components SET deleted_at=?,updated_at=?,dirty=1 WHERE id=?",
        params![now, now, id],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn create_movement(conn: &mut Connection, input: MovementInput) -> Result<(), String> {
    if !["in", "out", "adjustment"].contains(&input.kind.as_str())
        || input.quantity <= 0
        || input.quantity > 9_007_199_254_740_991
    {
        return Err("请填写有效的出入库信息。".into());
    }
    let tx = conn.transaction().map_err(db_error)?;
    let current = get_component(&tx, &input.component_id)?
        .filter(|c| c.deleted_at.is_none())
        .ok_or("元件不存在或已删除。")?;
    let delta = if input.kind == "out" {
        -input.quantity
    } else {
        input.quantity
    };
    let quantity = current
        .quantity
        .checked_add(delta)
        .filter(|v| (0..=9_007_199_254_740_991).contains(v))
        .ok_or("库存不足或数量超出范围。")?;
    let now = next_timestamp(Some(&current.updated_at))?;
    tx.execute(
        "UPDATE components SET quantity=?,location=CASE WHEN ?=0 THEN '' ELSE location END,updated_at=?,dirty=1 WHERE id=?",
        params![quantity, quantity, now, input.component_id],
    )
    .map_err(db_error)?;
    tx.execute("INSERT INTO stock_movements(id,component_id,type,quantity,note,created_at,dirty) VALUES(?,?,?,?,?,?,1)", params![uuid::Uuid::new_v4().to_string(),input.component_id,input.kind,input.quantity,input.note.trim(),now]).map_err(db_error)?;
    tx.commit().map_err(db_error)
}

pub fn set_stock_quantity(
    conn: &mut Connection,
    id: &str,
    quantity: i64,
    note: &str,
) -> Result<(), String> {
    if !(0..=9_007_199_254_740_991).contains(&quantity) {
        return Err("请填写有效的库存数量。".into());
    }
    let tx = conn.transaction().map_err(db_error)?;
    let current = get_component(&tx, id)?
        .filter(|component| component.deleted_at.is_none())
        .ok_or("元件不存在或已删除。")?;
    let difference = quantity - current.quantity;
    let now = next_timestamp(Some(&current.updated_at))?;
    tx.execute(
        "UPDATE components SET quantity=?,location=CASE WHEN ?=0 THEN '' ELSE location END,updated_at=?,dirty=1 WHERE id=?",
        params![quantity, quantity, now, id],
    )
    .map_err(db_error)?;
    if difference != 0 {
        let kind = if difference > 0 { "in" } else { "out" };
        tx.execute(
            "INSERT INTO stock_movements(id,component_id,type,quantity,note,created_at,dirty) VALUES(?,?,?,?,?,?,1)",
            params![uuid::Uuid::new_v4().to_string(), id, kind, difference.abs(), note.trim(), now],
        )
        .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)
}

// Pull never replaces unsent local edits, including edits made while the request was in flight.
pub fn apply_pull(
    conn: &mut Connection,
    incoming: &[Component],
    movements: &[Movement],
    incoming_boxes: &[StorageBox],
    incoming_projects: &[BomProject],
) -> Result<SyncReport, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let mut report = SyncReport::default();
    for c in incoming {
        let dirty: bool = tx
            .query_row("SELECT dirty FROM components WHERE id=?", [&c.id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(db_error)?
            .unwrap_or(false);
        if dirty {
            report.preserved += 1;
            continue;
        }
        let current = get_component(&tx, &c.id)?;
        if current
            .as_ref()
            .map(|old| timestamp(&old.updated_at))
            .transpose()?
            .unwrap_or(-1)
            <= timestamp(&c.updated_at)?
            && current.as_ref() != Some(c)
        {
            put_component(&tx, c)?;
            report.components += 1;
        }
    }
    for m in movements {
        if get_component(&tx, &m.component_id)?.is_none() {
            return Err("云端数据正在变化，请重新拉取。".into());
        }
        report.movements += tx.execute("INSERT INTO stock_movements(id,component_id,type,quantity,note,created_at,dirty) VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO NOTHING", params![m.id,m.component_id,m.kind,m.quantity,m.note,m.created_at]).map_err(db_error)?;
    }
    for b in incoming_boxes {
        let dirty: bool = tx
            .query_row("SELECT dirty FROM storage_boxes WHERE id=?", [&b.id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(db_error)?
            .unwrap_or(false);
        if dirty {
            report.preserved += 1;
            continue;
        }
        let current: Option<StorageBox> = tx
            .query_row(
                &format!("SELECT {BOX_COLUMNS} FROM storage_boxes WHERE id=?"),
                [&b.id],
                |r| {
                    Ok(StorageBox {
                        id: r.get(0)?,
                        label: r.get(1)?,
                        subtitle: r.get(2)?,
                        created_at: r.get(3)?,
                        updated_at: r.get(4)?,
                        deleted_at: r.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(db_error)?;
        if current
            .as_ref()
            .map(|old| timestamp(&old.updated_at))
            .transpose()?
            .unwrap_or(-1)
            <= timestamp(&b.updated_at)?
            && current.as_ref() != Some(b)
        {
            put_storage_box(&tx, b)?;
            report.boxes += 1;
        }
    }
    for p in incoming_projects {
        let dirty: bool = tx
            .query_row("SELECT dirty FROM bom_projects WHERE id=?", [&p.id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(db_error)?
            .unwrap_or(false);
        if dirty {
            report.preserved += 1;
            continue;
        }
        let current: Option<BomProject> = tx
            .query_row(
                &format!("SELECT {PROJECT_COLUMNS} FROM bom_projects WHERE id=?"),
                [&p.id],
                project_row,
            )
            .optional()
            .map_err(db_error)?;
        if current
            .as_ref()
            .map(|old| timestamp(&old.updated_at))
            .transpose()?
            .unwrap_or(-1)
            <= timestamp(&p.updated_at)?
            && current.as_ref() != Some(p)
        {
            put_bom_project(&tx, p)?;
            report.projects += 1;
        }
    }
    tx.commit().map_err(db_error)?;
    Ok(report)
}

// Only acknowledge the exact snapshot sent; newer local edits remain dirty.
pub fn acknowledge_push(
    conn: &mut Connection,
    sent: &[Component],
    received: &[Component],
    sent_movements: &[Movement],
    sent_boxes: &[StorageBox],
    received_boxes: &[StorageBox],
    sent_projects: &[BomProject],
    received_projects: &[BomProject],
) -> Result<usize, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let mut preserved = 0;
    for c in sent {
        let current = get_component(&tx, &c.id)?.ok_or("本地元件缺失。")?;
        if current.updated_at != c.updated_at {
            preserved += 1;
            continue;
        }
        let canonical = received
            .iter()
            .find(|r| r.id == c.id)
            .ok_or("云端未确认写入，请重试。")?;
        if timestamp(&canonical.updated_at)? < timestamp(&c.updated_at)? {
            return Err("云端未确认最新版本，请重试。".into());
        }
        put_component(&tx, canonical)?;
        tx.execute("UPDATE components SET dirty=0 WHERE id=?", [&c.id])
            .map_err(db_error)?;
    }
    for m in sent_movements {
        tx.execute("UPDATE stock_movements SET dirty=0 WHERE id=?", [&m.id])
            .map_err(db_error)?;
    }
    for b in sent_boxes {
        let current: StorageBox = tx
            .query_row(
                &format!("SELECT {BOX_COLUMNS} FROM storage_boxes WHERE id=?"),
                [&b.id],
                |r| {
                    Ok(StorageBox {
                        id: r.get(0)?,
                        label: r.get(1)?,
                        subtitle: r.get(2)?,
                        created_at: r.get(3)?,
                        updated_at: r.get(4)?,
                        deleted_at: r.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(db_error)?
            .ok_or("本地收纳盒缺失。")?;
        if current.updated_at != b.updated_at {
            preserved += 1;
            continue;
        }
        let canonical = received_boxes
            .iter()
            .find(|r| r.id == b.id)
            .ok_or("云端未确认收纳盒写入，请重试。")?;
        if timestamp(&canonical.updated_at)? < timestamp(&b.updated_at)? {
            return Err("云端未确认最新收纳盒版本，请重试。".into());
        }
        put_storage_box(&tx, canonical)?;
        tx.execute("UPDATE storage_boxes SET dirty=0 WHERE id=?", [&b.id])
            .map_err(db_error)?;
    }
    for p in sent_projects {
        let current: BomProject = tx
            .query_row(
                &format!("SELECT {PROJECT_COLUMNS} FROM bom_projects WHERE id=?"),
                [&p.id],
                project_row,
            )
            .optional()
            .map_err(db_error)?
            .ok_or("本地项目缺失。")?;
        if current.updated_at != p.updated_at {
            preserved += 1;
            continue;
        }
        let canonical = received_projects
            .iter()
            .find(|r| r.id == p.id)
            .ok_or("云端未确认项目写入，请重试。")?;
        if timestamp(&canonical.updated_at)? < timestamp(&p.updated_at)? {
            return Err("云端未确认最新项目版本，请重试。".into());
        }
        put_bom_project(&tx, canonical)?;
        tx.execute("UPDATE bom_projects SET dirty=0 WHERE id=?", [&p.id])
            .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)?;
    Ok(preserved)
}
