use crate::db::db_error;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ConfigInput {
    pub account_id: String,
    pub database_id: String,
    pub api_token: String,
}

#[derive(Default, Serialize)]
pub struct ConfigView {
    pub account_id: String,
    pub database_id: String,
    pub has_token: bool,
    pub last_push: Option<String>,
    pub last_pull: Option<String>,
}

pub struct CloudConfig {
    pub account_id: String,
    pub database_id: String,
    pub api_token: String,
}

fn setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM local_settings WHERE key=?", [key], |r| {
        r.get(0)
    })
    .optional()
    .map_err(db_error)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute("INSERT INTO local_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(db_error)?;
    Ok(())
}

pub fn view(conn: &Connection) -> Result<ConfigView, String> {
    Ok(ConfigView {
        account_id: setting(conn, "account_id")?.unwrap_or_default(),
        database_id: setting(conn, "database_id")?.unwrap_or_default(),
        has_token: conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_settings WHERE key='api_token')",
                [],
                |r| r.get(0),
            )
            .map_err(db_error)?,
        last_push: setting(conn, "last_push")?,
        last_pull: setting(conn, "last_pull")?,
    })
}

pub fn save(conn: &mut Connection, input: ConfigInput) -> Result<(), String> {
    let account = input.account_id.trim();
    let database = input.database_id.trim();
    if account.len() != 32
        || !account.bytes().all(|c| c.is_ascii_hexdigit())
        || uuid::Uuid::parse_str(database).is_err()
    {
        return Err("请填写有效的 Account ID 和 Database ID。".into());
    }
    let previous = view(conn)?;
    let target_changed = previous.account_id != account || previous.database_id != database;
    let token = input.api_token.trim();
    if token.is_empty() && (!previous.has_token || target_changed) {
        return Err("请填写 API Token。".into());
    }
    if token.contains(['\n', '\r']) {
        return Err("API Token 格式无效。".into());
    }
    let sealed = if token.is_empty() {
        None
    } else {
        Some(seal(token.as_bytes())?)
    };
    let tx = conn.transaction().map_err(db_error)?;
    set_setting(&tx, "account_id", account)?;
    set_setting(&tx, "database_id", database)?;
    if let Some(sealed) = sealed {
        tx.execute("INSERT INTO local_settings(key,value) VALUES('api_token',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [sealed]).map_err(db_error)?;
    }
    if target_changed {
        tx.execute_batch("UPDATE components SET dirty=1; UPDATE stock_movements SET dirty=1; DELETE FROM local_settings WHERE key IN ('last_push','last_pull');").map_err(db_error)?;
    }
    tx.commit().map_err(db_error)
}

pub fn load(conn: &Connection) -> Result<CloudConfig, String> {
    let config = view(conn)?;
    if !config.has_token {
        return Err("请先在系统设置中配置云端连接。".into());
    }
    let sealed: Vec<u8> = conn
        .query_row(
            "SELECT value FROM local_settings WHERE key='api_token'",
            [],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    let api_token =
        String::from_utf8(unseal(&sealed)?).map_err(|_| "无法读取 API Token，请重新保存配置。")?;
    Ok(CloudConfig {
        account_id: config.account_id,
        database_id: config.database_id,
        api_token,
    })
}

#[cfg(windows)]
fn crypt(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| "Token 过长。")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // DPAPI binds the encrypted token to the current Windows user. Never return it to the WebView.
    unsafe {
        let ok = if protect {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("系统凭据加密失败，请重新保存配置。".into());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as *mut core::ffi::c_void);
        Ok(result)
    }
}

#[cfg(windows)]
fn seal(data: &[u8]) -> Result<Vec<u8>, String> {
    crypt(data, true)
}
#[cfg(windows)]
fn unseal(data: &[u8]) -> Result<Vec<u8>, String> {
    crypt(data, false)
}

#[cfg(not(windows))]
fn seal_in_keyring(data: &[u8]) -> Result<Vec<u8>, String> {
    let id = uuid::Uuid::new_v4().to_string();
    keyring::Entry::new("com.retos.inventory", &id)
        .and_then(|e| e.set_secret(data))
        .map_err(|_| "无法访问系统凭据存储。")?;
    Ok(id.into_bytes())
}

#[cfg(not(windows))]
fn unseal_from_keyring(data: &[u8]) -> Result<Vec<u8>, String> {
    let id = std::str::from_utf8(data).map_err(|_| "无效的凭据引用。")?;
    keyring::Entry::new("com.retos.inventory", id)
        .and_then(|e| e.get_secret())
        .map_err(|_| "无法读取系统凭据。".into())
}

// Android installs an Android Keystore-backed keyring builder during application setup.
#[cfg(target_os = "android")]
fn seal(data: &[u8]) -> Result<Vec<u8>, String> {
    seal_in_keyring(data)
}

#[cfg(target_os = "android")]
fn unseal(data: &[u8]) -> Result<Vec<u8>, String> {
    unseal_from_keyring(data)
}

// macOS/iOS use Keychain; Linux and other Unix desktops use Secret Service.
#[cfg(all(not(windows), not(target_os = "android")))]
fn seal(data: &[u8]) -> Result<Vec<u8>, String> {
    seal_in_keyring(data)
}

#[cfg(all(not(windows), not(target_os = "android")))]
fn unseal(data: &[u8]) -> Result<Vec<u8>, String> {
    unseal_from_keyring(data)
}
