fn main() {
    tauri_build::build();

    // Клиентский код для нового gRPC-сервера (roadwits-rs) — только клиент
    // (build_server(false)), серверная часть тут не нужна, это десктопное
    // приложение, а не сервер. .proto-файлы скопированы 1:1 из репозитория
    // сервера (roadwits-rs/crates/roadwits-proto/proto) — см. src/grpc/mod.rs
    // про то, как сгенерированный код подключается.
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
