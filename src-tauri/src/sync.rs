use crate::{
    config::CloudConfig,
    db::{
        BOX_COLUMNS, COMPONENT_COLUMNS, PROJECT_COLUMNS, UPSERT_BOX, UPSERT_COMPONENT,
        UPSERT_PROJECT,
    },
    models::*,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::time::Duration;

pub struct Cloud {
    client: reqwest::Client,
    config: CloudConfig,
}

impl Cloud {
    pub fn new(config: CloudConfig) -> Result<Self, String> {
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(45))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .map_err(|_| "无法创建云端连接。")?,
            config,
        })
    }

    async fn request(&self, body: Value, expected: usize) -> Result<Vec<Value>, String> {
        let url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query",
            self.config.account_id, self.config.database_id
        );
        let response = self
            .client
            .post(url)
            .bearer_auth(&self.config.api_token)
            .json(&body)
            .send()
            .await
            .map_err(|_| "无法连接 D1，本地数据已保留，请稍后重试。")?;
        let status = response.status();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("D1 授权失败，请检查 API Token 和 D1 权限。".into());
        }
        if status.as_u16() == 429 {
            return Err("D1 请求过于频繁，请稍后重试。".into());
        }
        let payload: Value = response.json().await.map_err(|_| "D1 返回了无效响应。")?;
        parse_response(status.is_success(), payload, expected)
    }

    async fn query<T: DeserializeOwned>(&self, sql: &str, params: Value) -> Result<Vec<T>, String> {
        let result = self
            .request(json!({ "sql": sql, "params": params }), 1)
            .await?;
        serde_json::from_value(result[0].get("results").cloned().unwrap_or(json!([])))
            .map_err(|_| "D1 数据格式不兼容，请检查数据库迁移。".into())
    }

    pub async fn test(&self) -> Result<(), String> {
        self.query::<Value>("SELECT 1 AS ok", json!([])).await?;
        Ok(())
    }

    // Only called by explicit push/pull, never by opening the application or saving credentials.
    pub async fn ensure_schema(&self) -> Result<(), String> {
        let statements: Vec<_> = include_str!("../../scripts/d1-schema.sql")
            .split(';')
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.starts_with("PRAGMA"))
            .map(|sql| json!({"sql":sql,"params":[]}))
            .collect();
        self.request(json!({"batch":statements}), statements.len())
            .await?;
        let columns = self
            .query::<Value>("PRAGMA table_info(components)", json!([]))
            .await?;
        if !columns.iter().any(|c| c["name"] == "notes") {
            return Err("请先为旧数据库执行 d1-migration-002-component-fields.sql。".into());
        }
        if !columns.iter().any(|c| c["name"] == "deleted_at") {
            if let Err(error) = self
                .query::<Value>(
                    "ALTER TABLE components ADD COLUMN deleted_at TEXT",
                    json!([]),
                )
                .await
            {
                let refreshed = self
                    .query::<Value>("PRAGMA table_info(components)", json!([]))
                    .await?;
                if !refreshed.iter().any(|c| c["name"] == "deleted_at") {
                    return Err(error);
                }
            }
        }
        let project_columns = self
            .query::<Value>("PRAGMA table_info(bom_projects)", json!([]))
            .await?;
        if !project_columns.iter().any(|c| c["name"] == "start_date") {
            if let Err(error) = self
                .query::<Value>(
                    "ALTER TABLE bom_projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''",
                    json!([]),
                )
                .await
            {
                let refreshed = self
                    .query::<Value>("PRAGMA table_info(bom_projects)", json!([]))
                    .await?;
                if !refreshed.iter().any(|c| c["name"] == "start_date") {
                    return Err(error);
                }
            }
        }
        self.query::<Value>(
            "UPDATE bom_projects SET start_date = substr(created_at, 1, 10) WHERE start_date = ''",
            json!([]),
        )
        .await?;
        Ok(())
    }

    pub async fn download(
        &self,
    ) -> Result<
        (
            Vec<Component>,
            Vec<Movement>,
            Vec<StorageBox>,
            Vec<BomProject>,
        ),
        String,
    > {
        let components = self
            .pages::<Component>("components", COMPONENT_COLUMNS)
            .await?;
        let movements = self
            .pages::<Movement>(
                "stock_movements",
                "id,component_id,type,quantity,note,created_at",
            )
            .await?;
        let boxes = self
            .pages::<StorageBox>("storage_boxes", BOX_COLUMNS)
            .await?;
        let projects = self
            .pages::<BomProject>("bom_projects", PROJECT_COLUMNS)
            .await?;
        Ok((components, movements, boxes, projects))
    }

    async fn pages<T: DeserializeOwned + serde::Serialize>(
        &self,
        table: &str,
        columns: &str,
    ) -> Result<Vec<T>, String> {
        let mut all = Vec::new();
        let mut after = String::new();
        loop {
            let page = self
                .query::<T>(
                    &format!("SELECT {columns} FROM {table} WHERE id>? ORDER BY id LIMIT 250"),
                    json!([after]),
                )
                .await?;
            let count = page.len();
            if let Some(last) = page.last() {
                after = serde_json::to_value(last).map_err(|_| "读取云端分页失败。")?["id"]
                    .as_str()
                    .ok_or("云端记录缺少 ID。")?
                    .to_string();
            }
            all.extend(page);
            if count < 250 {
                break;
            }
        }
        Ok(all)
    }

    pub async fn upload(
        &self,
        components: &[Component],
        movements: &[Movement],
        boxes: &[StorageBox],
        projects: &[BomProject],
    ) -> Result<(Vec<Component>, Vec<StorageBox>, Vec<BomProject>), String> {
        // Timestamp comparisons use julianday to support both old SQLite dates and UTC ISO dates.
        let sql = format!("{UPSERT_COMPONENT} WHERE julianday(excluded.updated_at)>=julianday(components.updated_at)");
        for chunk in components.chunks(40) {
            let batch: Vec<_> = chunk.iter().map(|c| json!({ "sql": sql, "params": [c.id,c.name,c.category,c.package,c.value,c.quantity,c.min_quantity,c.location,c.notes,c.unit_price,c.created_at,c.updated_at,c.deleted_at] })).collect();
            self.request(json!({"batch":batch}), batch.len()).await?;
        }
        for chunk in movements.chunks(40) {
            let batch: Vec<_> = chunk.iter().map(|m| json!({ "sql": "INSERT INTO stock_movements(id,component_id,type,quantity,note,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING", "params": [m.id,m.component_id,m.kind,m.quantity,m.note,m.created_at] })).collect();
            self.request(json!({"batch":batch}), batch.len()).await?;
        }
        let box_sql = format!("{UPSERT_BOX} WHERE julianday(excluded.updated_at)>=julianday(storage_boxes.updated_at)");
        for chunk in boxes.chunks(40) {
            let batch: Vec<_> = chunk.iter().map(|b| json!({ "sql": box_sql, "params": [b.id,b.label,b.subtitle,b.created_at,b.updated_at,b.deleted_at] })).collect();
            self.request(json!({"batch":batch}), batch.len()).await?;
        }
        let project_sql = format!("{UPSERT_PROJECT} WHERE julianday(excluded.updated_at)>=julianday(bom_projects.updated_at)");
        for chunk in projects.chunks(20) {
            let batch: Vec<_> = chunk.iter().map(|p| json!({ "sql": project_sql, "params": [p.id,p.name,p.description,p.file_name,p.rows_json,p.completed_json,p.status,p.start_date,p.created_at,p.updated_at,p.deleted_at] })).collect();
            self.request(json!({"batch":batch}), batch.len()).await?;
        }
        let mut canonical = Vec::new();
        for chunk in components.chunks(80) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let ids: Vec<_> = chunk.iter().map(|c| &c.id).collect();
            canonical.extend(
                self.query::<Component>(
                    &format!(
                        "SELECT {COMPONENT_COLUMNS} FROM components WHERE id IN ({placeholders})"
                    ),
                    json!(ids),
                )
                .await?,
            );
        }
        let mut canonical_boxes = Vec::new();
        for chunk in boxes.chunks(80) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let ids: Vec<_> = chunk.iter().map(|b| &b.id).collect();
            canonical_boxes.extend(
                self.query::<StorageBox>(
                    &format!(
                        "SELECT {BOX_COLUMNS} FROM storage_boxes WHERE id IN ({placeholders})"
                    ),
                    json!(ids),
                )
                .await?,
            );
        }
        let mut canonical_projects = Vec::new();
        for chunk in projects.chunks(80) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let ids: Vec<_> = chunk.iter().map(|p| &p.id).collect();
            canonical_projects.extend(
                self.query::<BomProject>(
                    &format!(
                        "SELECT {PROJECT_COLUMNS} FROM bom_projects WHERE id IN ({placeholders})"
                    ),
                    json!(ids),
                )
                .await?,
            );
        }
        Ok((canonical, canonical_boxes, canonical_projects))
    }
}

pub fn parse_response(ok: bool, payload: Value, expected: usize) -> Result<Vec<Value>, String> {
    let result = payload["result"].as_array();
    if !ok
        || payload["success"] != true
        || result.is_none()
        || result.is_some_and(|r| r.len() != expected || r.iter().any(|q| q["success"] != true))
    {
        // Never echo API response bodies, which may contain SQL values or credentials.
        return Err("D1 未完成请求，本地修改已保留。请检查权限、表结构后重试。".into());
    }
    Ok(result.unwrap().clone())
}
