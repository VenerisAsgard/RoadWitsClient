#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

/* ============================================================
   Хранение сессии (fingerprint устройства, JWT).

   Сам файл хранилища ведёт tauri-plugin-store (JSON на диске, как у
   любого другого приложения на Tauri), но значения под ключами
   "fingerprint"/"token" в нём — не читаемый текст, а AES-256-GCM
   шифротекст. Ключ шифрования нигде не сохраняется: он каждый раз
   заново выводится из ID устройства (derive_key), поэтому просто
   скопировать файл хранилища на другой ПК недостаточно, чтобы
   прочитать из него токен — расшифровать его получится только на
   том же устройстве, где он был создан.
   ============================================================ */

const STORE_FILE: &str = "roadwits_session.store.json";
const KEY_FINGERPRINT: &str = "fingerprint";
const KEY_TOKEN: &str = "token";

/// Вшитая в бинарник "соль" — не секрет сама по себе (как и любая
/// константа в клиентском приложении), но не даёт ключу шифрования
/// совпасть с голым machine id устройства.
const APP_SALT: &[u8] = b"roadwits-client-session-v1";

fn derive_key() -> Result<[u8; 32], String> {
    let machine_id = machine_uid::get()
        .map_err(|e| format!("Не удалось определить ID устройства: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(APP_SALT);
    Ok(hasher.finalize().into())
}

fn encrypt(plaintext: &str) -> Result<String, String> {
    let key_bytes = derive_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "Не удалось зашифровать данные сессии".to_string())?;

    // nonce (12 байт) храним прямо перед шифротекстом — он не секрет,
    // просто должен быть под рукой при расшифровке того же значения.
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(combined))
}

fn decrypt(payload: &str) -> Result<String, String> {
    let key_bytes = derive_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let combined = STANDARD
        .decode(payload)
        .map_err(|_| "Повреждённые данные сессии".to_string())?;
    if combined.len() < 12 {
        return Err("Повреждённые данные сессии".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        // Сюда же попадает случай "файл хранилища скопирован с другого
        // устройства": ключ не совпадёт, и это просто ошибка расшифровки,
        // а не паника — вызывающий код трактует её как "данных нет".
        .map_err(|_| "Не удалось расшифровать данные сессии".to_string())?;

    String::from_utf8(plaintext).map_err(|_| "Повреждённые данные сессии".to_string())
}

fn store_get_string(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Не удалось открыть хранилище сессии: {e}"))?;

    let encrypted = match store.get(key) {
        Some(value) => value.as_str().map(str::to_string),
        None => None,
    };

    match encrypted {
        None => Ok(None),
        Some(enc) => match decrypt(&enc) {
            Ok(plain) => Ok(Some(plain)),
            Err(_) => {
                // Нечитаемое значение (файл хранилища перенесён с другого
                // устройства, повреждён, или ключ сменился) — не роняем
                // вызывающий код ошибкой, а стираем протухшую запись и
                // ведём себя так, будто сохранённых данных не было.
                store.delete(key);
                let _ = store.save();
                Ok(None)
            }
        },
    }
}

fn store_set_string(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Не удалось открыть хранилище сессии: {e}"))?;

    let enc = encrypt(value)?;
    store.set(key, serde_json::Value::String(enc));
    store
        .save()
        .map_err(|e| format!("Не удалось сохранить хранилище сессии: {e}"))
}

fn store_delete(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Не удалось открыть хранилище сессии: {e}"))?;

    store.delete(key);
    store
        .save()
        .map_err(|e| format!("Не удалось сохранить хранилище сессии: {e}"))
}


#[tauri::command]
fn get_fingerprint(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(fp) = store_get_string(&app, KEY_FINGERPRINT)? {
        return Ok(fp);
    }

    let generated = Uuid::new_v4().to_string();
    store_set_string(&app, KEY_FINGERPRINT, &generated)?;
    Ok(generated)
}


#[tauri::command]
fn save_token(
    app: tauri::AppHandle,
    token: String,
) -> Result<(), String> {
    store_set_string(&app, KEY_TOKEN, &token)
}


#[tauri::command]
fn load_token(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    store_get_string(&app, KEY_TOKEN)
}


#[tauri::command]
fn clear_token(
    app: tauri::AppHandle,
) -> Result<(), String> {
    store_delete(&app, KEY_TOKEN)
}


#[tauri::command]
fn is_flatpak() -> bool {
    // Flatpak всегда кладёт этот файл-маркер внутрь песочницы приложения.
    std::path::Path::new("/.flatpak-info").exists()
}

/// Вызывает `flatpak update` на ХОСТЕ (через flatpak-spawn — служебный
/// бинарник, который есть в любой Flatpak-песочнице по умолчанию и
/// обращается к порталу org.freedesktop.Flatpak) и перезапускает уже
/// обновлённое приложение тоже через хост. Нужен `--talk-name=
/// org.freedesktop.Flatpak` в finish-args манифеста (см.
/// flatpak_data/roadwits-client.flatpak.yaml) — без него portal откажет.
///
/// Вызывается только когда is_flatpak() уже вернул true (см. update.js) —
/// на не-Flatpak сборках flatpak-spawn просто не найдётся, и команда
/// вернёт понятную ошибку, ничего не сломав.
///
/// `flatpak update -y` может потребовать подтверждения через polkit
/// (системная установка) — это стандартный системный диалог, приложение
/// на него не влияет и просто ждёт результата.
#[tauri::command]
async fn flatpak_update_and_restart() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| -> Result<(), String> {
        let status = std::process::Command::new("flatpak-spawn")
            .args([
                "--host",
                "flatpak",
                "update",
                "-y",
                "--noninteractive",
                "com.roadwits.client",
            ])
            .status()
            .map_err(|e| format!("Не удалось вызвать flatpak update (flatpak-spawn): {e}"))?;

        if !status.success() {
            return Err(format!(
                "flatpak update завершился с ошибкой (код {:?})",
                status.code()
            ));
        }

        // Перезапуск — новым процессом на хосте, а не изнутри текущей
        // песочницы: та уже смонтирована на старую версию рантайма/бинарника
        // и не увидит обновление, пока сама не будет пересоздана. Текущий
        // процесс закрывает фронтенд сразу вслед за успешным invoke (см.
        // update.js) — здесь process::exit не вызываем, чтобы дать фронтенду
        // самому решить, когда закрыться (он это уже делает).
        let _ = std::process::Command::new("flatpak-spawn")
            .args(["--host", "flatpak", "run", "com.roadwits.client"])
            .spawn();

        Ok(())
    })
    .await
    .map_err(|e| format!("Внутренняя ошибка обновления: {e}"))?
}

/// Скачивает установщик по прямой ссылке (ассет GitHub Release) и
/// запускает его — «стандартный» способ обновления вместо тихой
/// самозамены бинарника. После запуска установщика фронтенд сам
/// закрывает приложение (см. src/js/update.js), чтобы установщик мог
/// без помех перезаписать файлы.
///
/// Не вызывается и не имеет смысла под Flatpak — там /app доступен
/// только на чтение, поэтому Linux-версия обновляется через
/// `flatpak update`, а не через эту команду (см. is_flatpak выше).
#[tauri::command]
async fn download_and_run_installer(url: String, filename: String) -> Result<(), String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Не удалось скачать установщик: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Сервер вернул ошибку: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Не удалось прочитать загруженный файл: {e}"))?;

    let mut path = std::env::temp_dir();
    path.push(&filename);

    fs::write(&path, &bytes).map_err(|e| format!("Не удалось сохранить установщик: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        // На Windows spawn() без доп. флагов создаёт дочерний процесс в том же
        // Job Object, что и текущий (WebView2/Tauri сам оборачивает себя в Job
        // с KILL_ON_JOB_CLOSE — это штатное поведение WebView2, не наша
        // настройка). Раньше сразу после этого фронтенд закрывал приложение
        // (exit(0), см. src/lib/update.js) — и в большинстве случаев Windows
        // убивал вместе с родителем и только что запущенный NSIS-инсталлятор,
        // не успевший инициализироваться: пользователь видел, что "обновление
        // скачалось", но окно инсталлятора либо не появлялось, либо мгновенно
        // исчезало, а само приложение просто закрывалось без установки —
        // это и есть баг "не скачивается и не устанавливается" на Windows.
        // CREATE_NEW_PROCESS_GROUP + DETACHED_PROCESS отвязывают инсталлятор
        // от процесса/Job-объекта и консоли родителя, чтобы он пережил выход
        // из приложения и мог спокойно доработать (в т.ч. переписать файлы
        // самого Roadwits, для чего процесс и должен был закрыться).
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const DETACHED_PROCESS: u32 = 0x00000008;
        std::process::Command::new(&path)
            .creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("Не удалось запустить установщик: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        // .dmg нельзя запустить напрямую — открываем через Finder,
        // дальше пользователь сам перетаскивает .app в Applications
        // (стандартный способ установки на macOS).
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Не удалось открыть установщик: {e}"))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_fingerprint,
            save_token,
            load_token,
            clear_token,
            is_flatpak,
            flatpak_update_and_restart,
            download_and_run_installer
        ])
        .setup(|app| {
            // Окно создаётся скрытым (tauri.conf.json → windows[0].visible:
            // false), чтобы не было короткого пустого/белого кадра до того,
            // как webview успеет что-то отрисовать (см. main.js — там оно
            // показывается сразу же, как только сплэш уже в DOM). Но если
            // фронтенд по какой-то причине не успеет выполниться (упавший
            // скрипт, медленная загрузка) — окно не должно остаться скрытым
            // навсегда, поэтому здесь отдельный подстраховочный таймер: если
            // окно всё ещё не показано через 3 секунды, показываем его сами.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    if let Ok(false) = window.is_visible() {
                        let _ = window.show();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
