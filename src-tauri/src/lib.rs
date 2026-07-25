#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Default)]
struct SessionData {
    fingerprint: Option<String>,
    token: Option<String>,
}

fn session_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Не удалось определить директорию данных приложения: {e}"))?;

    fs::create_dir_all(&dir)
        .map_err(|e| format!("Не удалось создать директорию данных: {e}"))?;

    Ok(dir.join("roadwits_session.json"))
}

fn read_session(app: &tauri::AppHandle) -> Result<SessionData, String> {
    let path = session_file_path(app)?;

    if !path.exists() {
        return Ok(SessionData::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Не удалось прочитать файл сессии: {e}"))?;

    serde_json::from_str(&raw)
        .map_err(|e| format!("Файл сессии повреждён: {e}"))
}

fn write_session(
    app: &tauri::AppHandle,
    data: &SessionData,
) -> Result<(), String> {
    let path = session_file_path(app)?;

    let raw = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Ошибка сериализации: {e}"))?;

    fs::write(&path, raw)
        .map_err(|e| format!("Не удалось записать файл сессии: {e}"))
}


#[tauri::command]
fn get_fingerprint(app: tauri::AppHandle) -> Result<String, String> {
    let mut session = read_session(&app)?;

    if let Some(fp) = &session.fingerprint {
        return Ok(fp.clone());
    }

    let generated = Uuid::new_v4().to_string();

    session.fingerprint = Some(generated.clone());

    write_session(&app, &session)?;

    Ok(generated)
}


#[tauri::command]
fn save_token(
    app: tauri::AppHandle,
    token: String,
) -> Result<(), String> {
    let mut session = read_session(&app)?;

    session.token = Some(token);

    write_session(&app, &session)
}


#[tauri::command]
fn load_token(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let session = read_session(&app)?;

    Ok(session.token)
}


#[tauri::command]
fn clear_token(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut session = read_session(&app)?;

    session.token = None;

    write_session(&app, &session)
}


pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())

        .invoke_handler(tauri::generate_handler![
            get_fingerprint,
            save_token,
            load_token,
            clear_token
        ])

        .setup(|app| {

            let splash = app
                .get_webview_window("splash")
                .expect("Splash window not found");


            let main = app
                .get_webview_window("main")
                .expect("Main window not found");


            std::thread::spawn(move || {

                /*
                    Здесь будет настоящая загрузка:

                    1. Получение fingerprint
                    2. Проверка сохраненного JWT
                    3. Проверка лицензии
                    4. Запрос пользователя /me
                */


                std::thread::sleep(
                    Duration::from_secs(2)
                );


                splash
                    .close()
                    .expect("Cannot close splash");


                main
                    .show()
                    .expect("Cannot show main");


                main
                    .set_focus()
                    .expect("Cannot focus main");

            });


            Ok(())
        })

        .run(tauri::generate_context!())

        .expect("error while running tauri application");
}
