//! Тесты на уровне gRPC-обработчиков (не сервисного слоя) для двух ролевых
//! правил, которые CHECKLIST.md явно перечисляет как проверенные вручную
//! через grpcurl:
//!   - "editor получает PermissionDenied на попытке сменить order главы"
//!   - "Admin не может удалить сам себя (DeleteLicense)"
//! Эти проверки живут в grpc/*_svc.rs (auth_ctx + ручные if), а не в
//! service/*.rs — поэтому и тест должен идти через ContentSvc/AdminSvc, а
//! не мимо них через content_service/license_service напрямую.

use serde_json::json;
use sqlx::PgPool;
use tonic::Request;

use roadwits_proto::v1::admin_service_server::AdminService as _;
use roadwits_proto::v1::content_service_server::ContentService as _;
use roadwits_proto::v1::{CreateLicenseRequest, DeleteLicenseRequest, UpdateChapterRequest};

use roadwits_server::config::Config;
use roadwits_server::db::models::UserType;
use roadwits_server::grpc::admin_svc::AdminSvc;
use roadwits_server::grpc::content_svc::ContentSvc;
use roadwits_server::service::{auth_service, content_service, license_service};

fn test_config() -> Config {
    Config {
        database_url: String::new(),
        jwt_secret: "test-secret-do-not-use-in-prod".to_string(),
        jwt_expire_minutes: 60,
        grpc_addr: "0.0.0.0:0".to_string(),
        app_name: "roadwits-test".to_string(),
    }
}

fn authorized<T>(payload: T, token: &str) -> Request<T> {
    let mut req = Request::new(payload);
    let value = format!("Bearer {token}")
        .parse()
        .expect("bearer header must be a valid ascii metadata value");
    req.metadata_mut().insert("authorization", value);
    req
}

#[sqlx::test(migrations = "../../migrations")]
async fn editor_cannot_reorder_chapter_but_admin_can(pool: PgPool) {
    let cfg = test_config();

    let editor = license_service::create_license(
        &pool, 30, None, None, None, UserType::Editor, json!({}), 1,
    )
    .await
    .unwrap();
    let admin = license_service::create_license(
        &pool, 30, None, None, None, UserType::Admin, json!({}), 1,
    )
    .await
    .unwrap();

    let editor_token = auth_service::login(&pool, &cfg, &editor.product_key, "editor-device")
        .await
        .unwrap();
    let admin_token = auth_service::login(&pool, &cfg, &admin.product_key, "admin-device")
        .await
        .unwrap();

    let chapter = content_service::create_chapter(&pool, "Глава 1", None, 0, Some(admin.id))
        .await
        .unwrap();

    let svc = ContentSvc { pool: pool.clone(), cfg: cfg.clone() };

    // Editor: смена title разрешена (order отсутствует в запросе).
    let title_only = svc
        .update_chapter(authorized(
            UpdateChapterRequest {
                chapter_id: chapter.id,
                title: Some("Новое название".to_string()),
                description: None,
                order: None,
            },
            &editor_token,
        ))
        .await;
    assert!(title_only.is_ok(), "editor must be able to rename a chapter: {title_only:?}");

    // Editor: смена order запрещена -> PermissionDenied, а не просто "ошибка".
    let reorder_by_editor = svc
        .update_chapter(authorized(
            UpdateChapterRequest {
                chapter_id: chapter.id,
                title: None,
                description: None,
                order: Some(5),
            },
            &editor_token,
        ))
        .await;
    let status = reorder_by_editor.expect_err("editor must not be able to reorder a chapter");
    assert_eq!(status.code(), tonic::Code::PermissionDenied);

    // Admin: та же операция разрешена.
    let reorder_by_admin = svc
        .update_chapter(authorized(
            UpdateChapterRequest {
                chapter_id: chapter.id,
                title: None,
                description: None,
                order: Some(5),
            },
            &admin_token,
        ))
        .await;
    assert!(reorder_by_admin.is_ok(), "admin must be able to reorder a chapter: {reorder_by_admin:?}");
    assert_eq!(reorder_by_admin.unwrap().into_inner().order, 5);
}

#[sqlx::test(migrations = "../../migrations")]
async fn admin_cannot_delete_own_license_but_can_delete_others(pool: PgPool) {
    let cfg = test_config();

    let admin = license_service::create_license(
        &pool, 30, None, None, None, UserType::Admin, json!({}), 1,
    )
    .await
    .unwrap();
    let student = license_service::create_license(
        &pool, 30, None, None, None, UserType::Student, json!({}), 1,
    )
    .await
    .unwrap();

    let admin_token = auth_service::login(&pool, &cfg, &admin.product_key, "admin-device")
        .await
        .unwrap();

    let svc = AdminSvc { pool: pool.clone(), cfg: cfg.clone() };

    let self_delete = svc
        .delete_license(authorized(DeleteLicenseRequest { user_id: admin.id }, &admin_token))
        .await;
    let status = self_delete.expect_err("admin must not be able to delete their own license");
    assert_eq!(status.code(), tonic::Code::PermissionDenied);

    let other_delete = svc
        .delete_license(authorized(DeleteLicenseRequest { user_id: student.id }, &admin_token))
        .await;
    assert!(other_delete.is_ok(), "admin must be able to delete someone else's license: {other_delete:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn non_admin_cannot_create_licenses(pool: PgPool) {
    let cfg = test_config();
    let student = license_service::create_license(
        &pool, 30, None, None, None, UserType::Student, json!({}), 1,
    )
    .await
    .unwrap();
    let student_token = auth_service::login(&pool, &cfg, &student.product_key, "device-1")
        .await
        .unwrap();

    let svc = AdminSvc { pool: pool.clone(), cfg: cfg.clone() };
    let result = svc
        .create_license(authorized(
            CreateLicenseRequest {
                license_days: 30,
                email: None,
                first_name: None,
                last_name: None,
                user_type: "student".to_string(),
                payment_info: None,
                max_devices: 1,
            },
            &student_token,
        ))
        .await;
    let status = result.expect_err("a student must not be able to create licenses");
    assert_eq!(status.code(), tonic::Code::PermissionDenied);
}
