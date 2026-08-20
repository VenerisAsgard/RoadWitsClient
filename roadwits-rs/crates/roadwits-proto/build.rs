fn main() -> Result<(), Box<dyn std::error::Error>> {
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
        .build_server(true)
        .build_client(true)
        .compile(&protos, &["proto"])?;

    Ok(())
}
