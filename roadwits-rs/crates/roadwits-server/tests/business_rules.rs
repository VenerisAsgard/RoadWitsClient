//! Интеграционные тесты бизнес-правил, перечисленных в CHECKLIST.md разделы
//! 3-4 как "проверено вживую через grpcurl". Цель — закрепить это кодом, как
//! просит CHECKLIST.md: "любой новый gRPC-метод ... нужно гонять через
//! grpcurl (или интеграционный тест) до мержа, компиляция одна такие вещи не
//! ловит".
//!
//! Каждый тест поднимает СВОЮ базу через #[sqlx::test] (создается заново из
//! ../../migrations, накатывается и удаляется автоматически) — тесты
//! полностью изолированы друг от друга и могут идти параллельно.
//! Требует доступный Postgres по DATABASE_URL (см. .env.example) — как и
//! обычная разработка сервера.

use serde_json::json;
use sqlx::PgPool;

use roadwits_server::config::Config;
use roadwits_server::db::models::UserType;
use roadwits_server::error::AppError;
use roadwits_server::repo::question_repo;
use roadwits_server::service::{auth_service, content_service, friendship_service, license_service};

fn test_config() -> Config {
    Config {
        database_url: String::new(), // не используется — пул уже подключен sqlx::test
        jwt_secret: "test-secret-do-not-use-in-prod".to_string(),
        jwt_expire_minutes: 60,
        grpc_addr: "0.0.0.0:0".to_string(),
        app_name: "roadwits-test".to_string(),
    }
}

async fn create_user(
    pool: &PgPool,
    license_days: i32,
    email: Option<&str>,
    user_type: UserType,
    max_devices: i32,
) -> roadwits_server::db::models::UserRow {
    license_service::create_license(pool, license_days, email, None, None, user_type, json!({}), max_devices)
        .await
        .expect("test user creation must succeed")
}

// --- Login: порядок проверок (CHECKLIST.md §3, первый пункт) -------------
//
// product_key -> is_blocked -> license_until -> device slot, именно в этом
// порядке. Проверяем каждую ветку отдельно, а не только "happy path".

#[sqlx::test(migrations = "../../migrations")]
async fn login_rejects_unknown_product_key(pool: PgPool) {
    let cfg = test_config();
    let result = auth_service::login(&pool, &cfg, "NOSUCH_KEYXXX_000000_000000", "device-1").await;
    assert!(
        matches!(result, Err(AppError::InvalidProductKey)),
        "expected InvalidProductKey, got {result:?}"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_rejects_blocked_license_before_checking_expiry(pool: PgPool) {
    let cfg = test_config();
    // license_days отрицательный -> лицензия и заблокирована, и просрочена;
    // именно блокировка должна сработать первой (порядок важен).
    let user = create_user(&pool, -1, None, UserType::Student, 1).await;
    license_service::block_license(&pool, user.id).await.unwrap();

    let result = auth_service::login(&pool, &cfg, &user.product_key, "device-1").await;
    assert!(
        matches!(result, Err(AppError::LicenseBlocked)),
        "expected LicenseBlocked to take priority over LicenseExpired, got {result:?}"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_rejects_expired_license(pool: PgPool) {
    let cfg = test_config();
    let user = create_user(&pool, -1, None, UserType::Student, 1).await;

    let result = auth_service::login(&pool, &cfg, &user.product_key, "device-1").await;
    assert!(
        matches!(result, Err(AppError::LicenseExpired)),
        "expected LicenseExpired, got {result:?}"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn login_succeeds_and_reuses_known_device(pool: PgPool) {
    let cfg = test_config();
    let user = create_user(&pool, 30, None, UserType::Student, 1).await;

    let token1 = auth_service::login(&pool, &cfg, &user.product_key, "device-1")
        .await
        .expect("first login on a fresh slot must succeed");
    assert!(!token1.is_empty());

    // Повторный вход с того же устройства не занимает второй слот.
    let token2 = auth_service::login(&pool, &cfg, &user.product_key, "device-1")
        .await
        .expect("repeat login from the same device must succeed");
    assert!(!token2.is_empty());
}

// --- Device limit + ResetDevice (CHECKLIST.md §3, второй пункт) ----------

#[sqlx::test(migrations = "../../migrations")]
async fn login_enforces_device_limit_then_reset_device_frees_it(pool: PgPool) {
    let cfg = test_config();
    let user = create_user(&pool, 30, None, UserType::Student, 1).await; // max_devices = 1

    auth_service::login(&pool, &cfg, &user.product_key, "device-a")
        .await
        .expect("first device must be accepted");

    let second = auth_service::login(&pool, &cfg, &user.product_key, "device-b").await;
    assert!(
        matches!(second, Err(AppError::DeviceLimitReached(1))),
        "expected DeviceLimitReached(1) for the 2nd device on a 1-slot license, got {second:?}"
    );

    license_service::reset_device(&pool, user.id)
        .await
        .expect("admin reset_device must succeed");

    auth_service::login(&pool, &cfg, &user.product_key, "device-b")
        .await
        .expect("device-b must be accepted after ResetDevice frees the slot");
}

// --- get_current_user: ResetDevice мгновенно инвалидирует старый токен ---

#[sqlx::test(migrations = "../../migrations")]
async fn reset_device_invalidates_existing_token_immediately(pool: PgPool) {
    let cfg = test_config();
    let user = create_user(&pool, 30, None, UserType::Student, 1).await;

    let token = auth_service::login(&pool, &cfg, &user.product_key, "device-a")
        .await
        .unwrap();

    // Токен ещё не истёк, но устройство отвязано администратором.
    license_service::reset_device(&pool, user.id).await.unwrap();

    let result = auth_service::get_current_user(&pool, &cfg, &token).await;
    assert!(
        matches!(result, Err(AppError::InvalidToken)),
        "expected InvalidToken right after ResetDevice even though JWT hasn't expired, got {result:?}"
    );
}

// --- Задания: минимум 2 варианта, ровно один правильный (CHECKLIST §3) ---
// и атомарность записи (CHECKLIST §4, баг №2: невалидный набор ответов не
// должен оставлять "осиротевший" вопрос без вариантов в БД).

#[sqlx::test(migrations = "../../migrations")]
async fn question_creation_rejects_invalid_answer_sets_without_writing_anything(pool: PgPool) {
    let admin = create_user(&pool, 30, None, UserType::Admin, 1).await;
    let chapter = content_service::create_chapter(&pool, "Глава 1", None, 0, Some(admin.id))
        .await
        .unwrap();

    // Меньше 2 вариантов.
    let too_few = content_service::create_question(
        &pool,
        chapter.id,
        "Вопрос?",
        0,
        None,
        None,
        &[("Единственный вариант".to_string(), true)],
        Some(admin.id),
    )
    .await;
    assert!(matches!(too_few, Err(AppError::Content(_))));

    // Два правильных варианта вместо ровно одного.
    let two_correct = content_service::create_question(
        &pool,
        chapter.id,
        "Вопрос?",
        0,
        None,
        None,
        &[
            ("А".to_string(), true),
            ("Б".to_string(), true),
        ],
        Some(admin.id),
    )
    .await;
    assert!(matches!(two_correct, Err(AppError::Content(_))));

    // Ни одного правильного варианта.
    let zero_correct = content_service::create_question(
        &pool,
        chapter.id,
        "Вопрос?",
        0,
        None,
        None,
        &[("А".to_string(), false), ("Б".to_string(), false)],
        Some(admin.id),
    )
    .await;
    assert!(matches!(zero_correct, Err(AppError::Content(_))));

    // Ни одна из трёх неудачных попыток не должна была попасть в БД —
    // это и есть регресс-тест на баг №2 (осиротевшие строки).
    let questions = question_repo::list_by_chapter(&pool, chapter.id).await.unwrap();
    assert!(
        questions.is_empty(),
        "invalid answer sets must not leave orphan question rows, found {}",
        questions.len()
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn question_creation_with_valid_answers_persists_atomically(pool: PgPool) {
    let admin = create_user(&pool, 30, None, UserType::Admin, 1).await;
    let chapter = content_service::create_chapter(&pool, "Глава 1", None, 0, Some(admin.id))
        .await
        .unwrap();

    let question = content_service::create_question(
        &pool,
        chapter.id,
        "2 + 2 = ?",
        0,
        None,
        None,
        &[
            ("3".to_string(), false),
            ("4".to_string(), true),
            ("5".to_string(), false),
        ],
        Some(admin.id),
    )
    .await
    .expect("valid answer set must be accepted");

    let answers = question_repo::list_answers(&pool, question.id).await.unwrap();
    assert_eq!(answers.len(), 3);
    assert_eq!(answers.iter().filter(|a| a.is_correct).count(), 1);

    // question_count в списке глав тоже должен отражать реально записанный вопрос
    // (регресс-тест на баг №1: "column!" вне query!-макроса ломал именно этот подсчет).
    let chapters = content_service::list_chapters(&pool).await.unwrap();
    let updated_chapter = chapters.iter().find(|c| c.id == chapter.id).unwrap();
    assert_eq!(updated_chapter.question_count, 1);
}

// --- Дружба и лидерборд (CHECKLIST §3: send -> accept -> leaderboard) ----

#[sqlx::test(migrations = "../../migrations")]
async fn friendship_full_cycle_and_leaderboard_points(pool: PgPool) {
    let alice = create_user(&pool, 30, Some("alice@test.dev"), UserType::Student, 1).await;
    let bob = create_user(&pool, 30, Some("bob@test.dev"), UserType::Student, 1).await;

    // Нельзя добавить себя.
    let self_add = friendship_service::send_request(&pool, &alice, "alice@test.dev").await;
    assert!(matches!(self_add, Err(AppError::Friendship(_))));

    let friendship = friendship_service::send_request(&pool, &alice, "bob@test.dev")
        .await
        .expect("sending a request to an existing, different user must succeed");

    // Нельзя дублировать уже отправленную заявку.
    let duplicate = friendship_service::send_request(&pool, &alice, "bob@test.dev").await;
    assert!(matches!(duplicate, Err(AppError::Friendship(_))));

    // Принять может только адресат — не отправитель.
    let wrong_acceptor = friendship_service::accept_request(&pool, alice.id, friendship.id).await;
    assert!(matches!(wrong_acceptor, Err(AppError::NotAddressee)));

    friendship_service::accept_request(&pool, bob.id, friendship.id)
        .await
        .expect("the addressee must be able to accept");

    // Баллы Боба копятся в settings.quiz_stats, как в реальном клиенте.
    roadwits_server::repo::user_repo::update_settings(
        &pool,
        bob.id,
        json!({ "quiz_stats": { "chapter1": { "answered": 15 } } }),
    )
    .await
    .unwrap();

    let leaderboard = friendship_service::leaderboard(&pool, &alice).await.unwrap();
    assert_eq!(leaderboard.len(), 2, "expected self + 1 accepted friend");

    let bob_entry = leaderboard.iter().find(|e| e.user_id == bob.id).unwrap();
    assert_eq!(bob_entry.points, 15);
    assert!(!bob_entry.is_me);

    let alice_entry = leaderboard.iter().find(|e| e.user_id == alice.id).unwrap();
    assert_eq!(alice_entry.points, 0);
    assert!(alice_entry.is_me);

    // Сортировка по убыванию очков: Боб (15) должен идти раньше Алисы (0).
    assert_eq!(leaderboard[0].user_id, bob.id);
}

#[sqlx::test(migrations = "../../migrations")]
async fn either_side_can_remove_a_friendship_in_any_status(pool: PgPool) {
    let alice = create_user(&pool, 30, Some("alice@test.dev"), UserType::Student, 1).await;
    let bob = create_user(&pool, 30, Some("bob@test.dev"), UserType::Student, 1).await;
    let carol = create_user(&pool, 30, Some("carol@test.dev"), UserType::Student, 1).await;

    let friendship = friendship_service::send_request(&pool, &alice, "bob@test.dev")
        .await
        .unwrap();

    // Посторонний не может тронуть чужую заявку.
    let unrelated = friendship_service::remove(&pool, carol.id, friendship.id).await;
    assert!(matches!(unrelated, Err(AppError::NotYourFriendship)));

    // Получатель может отклонить ещё не принятую заявку.
    friendship_service::remove(&pool, bob.id, friendship.id)
        .await
        .expect("addressee must be able to reject a pending request");

    let remaining = friendship_service::list_incoming(&pool, bob.id).await.unwrap();
    assert!(remaining.is_empty());
}
