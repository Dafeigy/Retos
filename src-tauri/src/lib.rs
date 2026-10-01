mod config;
mod db;
mod models;
mod sync;
#[cfg(test)]
mod tests;

use models::*;
use rusqlite::Connection;
use std::sync::{Mutex, MutexGuard};
use tauri::{Manager, State};

struct AppState {
    db: Mutex<Connection>,
    sync_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    fn connection(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.db
            .lock()
            .map_err(|_| "本地数据库不可用，请重启应用。".into())
    }
}

#[tauri::command]
fn inventory_snapshot(state: State<AppState>) -> Result<Snapshot, String> {
    db::snapshot(&*state.connection()?)
}

#[tauri::command]
fn save_component(
    state: State<AppState>,
    id: Option<String>,
    input: ComponentInput,
) -> Result<(), String> {
    db::save_component(&mut *state.connection()?, id, input)
}

#[tauri::command]
fn delete_component(state: State<AppState>, id: String) -> Result<(), String> {
    db::delete_component(&mut *state.connection()?, &id)
}

#[tauri::command]
fn save_storage_box(state: State<AppState>, id: Option<String>, input: StorageBoxInput) -> Result<(), String> {
    db::save_storage_box(&mut *state.connection()?, id, input)
}

#[tauri::command]
fn delete_storage_box(state: State<AppState>, id: String) -> Result<(), String> {
    db::delete_storage_box(&mut *state.connection()?, &id)
}

#[tauri::command]
fn create_movement(state: State<AppState>, input: MovementInput) -> Result<(), String> {
    db::create_movement(&mut *state.connection()?, input)
}

#[tauri::command]
fn set_stock_quantity(state: State<AppState>, id: String, quantity: i64, note: String) -> Result<(), String> {
    db::set_stock_quantity(&mut *state.connection()?, &id, quantity, &note)
}

#[tauri::command]
fn cloud_config(state: State<AppState>) -> Result<config::ConfigView, String> {
    config::view(&*state.connection()?)
}

#[tauri::command]
async fn save_cloud_config(
    state: State<'_, AppState>,
    input: config::ConfigInput,
) -> Result<(), String> {
    let _sync = state
        .sync_lock
        .try_lock()
        .map_err(|_| "同步进行中，请稍后保存配置。")?;
    config::save(&mut *state.connection()?, input)
}

#[tauri::command]
async fn test_cloud_connection(state: State<'_, AppState>) -> Result<(), String> {
    let config = config::load(&*state.connection()?)?;
    sync::Cloud::new(config)?.test().await
}

#[tauri::command]
async fn sync_inventory(
    state: State<'_, AppState>,
    direction: String,
) -> Result<SyncReport, String> {
    if direction != "push" && direction != "pull" {
        return Err("无效的同步方向。".into());
    }
    let _sync = state.sync_lock.try_lock().map_err(|_| "同步正在进行中。")?;
    let config = config::load(&*state.connection()?)?;
    let cloud = sync::Cloud::new(config)?;
    cloud.ensure_schema().await?;
    let report = if direction == "push" {
        let (components, movements, boxes) = {
            let conn = state.connection()?;
            (db::components(&conn, true)?, db::movements(&conn, true)?, db::storage_boxes(&conn, true)?)
        };
        let (canonical, canonical_boxes) = cloud.upload(&components, &movements, &boxes).await?;
        let preserved = db::acknowledge_push(
            &mut *state.connection()?,
            &components,
            &canonical,
            &movements,
            &boxes,
            &canonical_boxes,
        )?;
        SyncReport {
            components: components.len(),
            movements: movements.len(),
            boxes: boxes.len(),
            preserved,
        }
    } else {
        let (components, movements, boxes) = cloud.download().await?;
        db::apply_pull(&mut *state.connection()?, &components, &movements, &boxes)?
    };
    config::set_setting(
        &*state.connection()?,
        if direction == "push" {
            "last_push"
        } else {
            "last_pull"
        },
        &db::next_timestamp(None)?,
    )?;
    Ok(report)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "android")]
            android_keyring::set_android_keyring_credential_builder().map_err(|error| {
                std::io::Error::other(format!("无法初始化 Android 系统凭据存储：{error}"))
            })?;

            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let mut connection = Connection::open(directory.join("inventory.sqlite3"))?;
            db::initialize(&mut connection).map_err(std::io::Error::other)?;
            app.manage(AppState {
                db: Mutex::new(connection),
                sync_lock: tokio::sync::Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            inventory_snapshot,
            save_component,
            delete_component,
            save_storage_box,
            delete_storage_box,
            create_movement,
            set_stock_quantity,
            cloud_config,
            save_cloud_config,
            test_cloud_connection,
            sync_inventory
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Retos");
}
