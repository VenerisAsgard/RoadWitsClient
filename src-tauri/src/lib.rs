mod fingerprint;


#[tauri::command]
fn device_fingerprint()->String{

    fingerprint::get_fingerprint()

}


#[tauri::command]
fn greet(name: &str) -> String {

    format!(
        "Hello, {}! You've been greeted from Rust!",
        name
    )

}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()

        // уже был
        .plugin(
            tauri_plugin_opener::init()
        )

        // добавляем store
        .plugin(
            tauri_plugin_store::Builder::new()
            .build()
        )

        .invoke_handler(
            tauri::generate_handler![
                greet,
                device_fingerprint
            ]
        )

        .run(
            tauri::generate_context!()
        )

        .expect(
            "error while running tauri application"
        );

}
