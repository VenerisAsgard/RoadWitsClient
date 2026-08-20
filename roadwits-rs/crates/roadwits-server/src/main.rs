use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

use roadwits_proto::v1::admin_service_server::AdminServiceServer;
use roadwits_proto::v1::auth_service_server::AuthServiceServer;
use roadwits_proto::v1::content_service_server::ContentServiceServer;
use roadwits_proto::v1::friends_service_server::FriendsServiceServer;

use roadwits_server::config::Config;
use roadwits_server::grpc::{
    admin_svc::AdminSvc, auth_svc::AuthSvc, content_svc::ContentSvc, friends_svc::FriendsSvc,
};
use roadwits_server::db;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let cfg = Config::from_env();
    tracing::info!(app = %cfg.app_name, addr = %cfg.grpc_addr, "starting");

    let pool = db::connect(&cfg.database_url).await?;
    sqlx::migrate!("../../migrations").run(&pool).await?;

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<AuthServiceServer<AuthSvc>>()
        .await;
    health_reporter
        .set_serving::<AdminServiceServer<AdminSvc>>()
        .await;
    health_reporter
        .set_serving::<ContentServiceServer<ContentSvc>>()
        .await;
    health_reporter
        .set_serving::<FriendsServiceServer<FriendsSvc>>()
        .await;

    let addr = cfg.grpc_addr.parse()?;

    tracing::info!(%addr, "grpc server listening");

    Server::builder()
        .add_service(health_service)
        .add_service(AuthServiceServer::new(AuthSvc {
            pool: pool.clone(),
            cfg: cfg.clone(),
        }))
        .add_service(AdminServiceServer::new(AdminSvc {
            pool: pool.clone(),
            cfg: cfg.clone(),
        }))
        .add_service(ContentServiceServer::new(ContentSvc {
            pool: pool.clone(),
            cfg: cfg.clone(),
        }))
        .add_service(FriendsServiceServer::new(FriendsSvc {
            pool: pool.clone(),
            cfg: cfg.clone(),
        }))
        .serve(addr)
        .await?;

    Ok(())
}
