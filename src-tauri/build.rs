fn main() {
    tauri_build::build();

    // Используем vendored protoc, чтобы сборка не зависела
    // от системной установки protoc.
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .expect("не удалось найти vendored protoc");

    std::env::set_var("PROTOC", protoc);

    // Клиентский код для нового gRPC-сервера (roadwits-rs) — только клиент
    // (build_server(false)), серверная часть тут не нужна, это десктопное
    // приложение, а не сервер.
    let protos = [
        "proto/roadwits/v1/auth.proto",
        "proto/roadwits/v1/admin.proto",
        "proto/roadwits/v1/content.proto",
        "proto/roadwits/v1/friends.proto",
    ];

    for p in &protos {
        println!("cargo:rerun-if-changed={p}");
    }
    println!("cargo:rerun-if-changed=proto");

    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile(&protos, &["proto"])
        .expect("не удалось скомпилировать .proto нового сервера");
}
