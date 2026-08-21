//! Tauri-команды, вызываемые фронтендом через `invoke(...)` вместо старого
//! `fetch(...)`. Один вызов = один gRPC-метод. Формы возвращаемых структур
//! (JSON, который видит JS) намеренно повторяют старые REST-ответы
//! (snake_case, те же имена полей) — это позволило не трогать
//! normalizeChapter/normalizeQuestion и остальной фронтенд-код, который эти
//! поля читает (см. src/lib/api/api.js, src/lib/admin.js).

use super::convert::{json_to_struct, opt_ts_to_iso, struct_to_json};
use super::error::{bad_request_to_js, status_to_js};
use super::pb::v1 as pb;
use super::GrpcChannel;
use serde::Serialize;
use serde_json::Value as JValue;
use tauri::State;

type CmdResult<T> = Result<T, String>;

/// Прикрепляет `authorization: Bearer <token>` в metadata вызова — аналог
/// заголовка Authorization в старом REST-клиенте (см. api.js request()).
/// token отсутствует только для одного метода — Login (там им и предстоит
/// обзавестись).
fn auth_request<T>(msg: T, token: &Option<String>) -> CmdResult<tonic::Request<T>> {
    let mut req = tonic::Request::new(msg);
    if let Some(t) = token {
        let value = format!("Bearer {t}")
            .parse()
            .map_err(|_| bad_request_to_js("Некорректный токен"))?;
        req.metadata_mut().insert("authorization", value);
    }
    Ok(req)
}

/* ============================================================
   AUTH
   ============================================================ */

#[derive(Serialize)]
pub struct LoginOut {
    pub access_token: String,
    pub token_type: String,
}

#[derive(Serialize)]
pub struct MeOut {
    pub id: i64,
    pub product_key: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub license_until: String,
    pub user_type: String,
    pub is_blocked: bool,
    pub settings: JValue,
    pub profile_photo: Option<String>,
}

impl From<pb::MeResponse> for MeOut {
    fn from(m: pb::MeResponse) -> Self {
        MeOut {
            id: m.id,
            product_key: m.product_key,
            email: m.email,
            first_name: m.first_name,
            last_name: m.last_name,
            license_until: opt_ts_to_iso(&m.license_until).unwrap_or_default(),
            user_type: m.user_type,
            is_blocked: m.is_blocked,
            settings: m.settings.map(|s| struct_to_json(&s)).unwrap_or(JValue::Object(Default::default())),
            profile_photo: m.profile_photo,
        }
    }
}

#[tauri::command]
pub async fn login(
    channel: State<'_, GrpcChannel>,
    product_key: String,
    fingerprint: String,
) -> CmdResult<LoginOut> {
    let mut client = pb::auth_service_client::AuthServiceClient::new(channel.channel().await);
    let req = auth_request(pb::LoginRequest { product_key, fingerprint }, &None)?;
    let resp = client.login(req).await.map_err(status_to_js)?.into_inner();
    Ok(LoginOut { access_token: resp.access_token, token_type: resp.token_type })
}

#[tauri::command]
pub async fn me(channel: State<'_, GrpcChannel>, token: Option<String>) -> CmdResult<MeOut> {
    let mut client = pb::auth_service_client::AuthServiceClient::new(channel.channel().await);
    let req = auth_request(pb::MeRequest {}, &token)?;
    let resp = client.me(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn update_settings(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    settings: JValue,
) -> CmdResult<MeOut> {
    let mut client = pb::auth_service_client::AuthServiceClient::new(channel.channel().await);
    let req = auth_request(
        pb::UpdateSettingsRequest { settings: Some(json_to_struct(&settings)) },
        &token,
    )?;
    let resp = client.update_settings(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

/// `first_name`/`last_name`/`email`/`profile_photo` — `Option<String>`:
/// фронтенд включает ключ в вызов, только когда действительно хочет
/// изменить поле (см. api.js updateProfile — profilePhoto добавляется в
/// body только если !== undefined). Отсутствующий у Tauri-команды
/// необязательный аргумент десериализуется в `None`, что здесь и означает
/// "не менять" — ровно та же presence-семантика, что была на HTTP-теле, но
/// уже на уровне gRPC `optional` (см. api_migration_map.md, AuthService).
#[tauri::command]
pub async fn update_profile(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    profile_photo: Option<String>,
) -> CmdResult<MeOut> {
    let mut client = pb::auth_service_client::AuthServiceClient::new(channel.channel().await);
    let mut req = auth_request(
        pb::UpdateProfileRequest { first_name, last_name, email, profile_photo },
        &token,
    )?;
    // Фото может весить сотни КБ base64 — даём этому вызову больше времени,
    // чем остальным (аналог PHOTO_UPLOAD_TIMEOUT_MS в старом config.js).
    req.set_timeout(std::time::Duration::from_secs(90));
    let resp = client.update_profile(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

/* ============================================================
   ГЛАВЫ И ВОПРОСЫ
   ============================================================ */

#[derive(Serialize)]
pub struct ChapterOut {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub order: i32,
    pub question_count: i32,
    pub created_by_id: Option<i64>,
    pub created_by_email: Option<String>,
}

impl From<pb::Chapter> for ChapterOut {
    fn from(c: pb::Chapter) -> Self {
        ChapterOut {
            id: c.id,
            title: c.title,
            description: c.description,
            order: c.order,
            question_count: c.question_count,
            created_by_id: c.created_by_id,
            created_by_email: c.created_by_email,
        }
    }
}

#[derive(Serialize)]
pub struct AnswerOut {
    pub id: i64,
    pub text: String,
    pub is_correct: bool,
}

impl From<pb::Answer> for AnswerOut {
    fn from(a: pb::Answer) -> Self {
        AnswerOut { id: a.id, text: a.text, is_correct: a.is_correct }
    }
}

#[derive(Serialize)]
pub struct QuestionOut {
    pub id: i64,
    pub chapter_id: i64,
    pub text: String,
    pub order: i32,
    pub hint: Option<String>,
    pub image_base64: Option<String>,
    pub created_by_id: Option<i64>,
    pub created_by_email: Option<String>,
    pub created_at: String,
    pub answers: Vec<AnswerOut>,
}

impl From<pb::Question> for QuestionOut {
    fn from(q: pb::Question) -> Self {
        QuestionOut {
            id: q.id,
            chapter_id: q.chapter_id,
            text: q.text,
            order: q.order,
            hint: q.hint,
            image_base64: q.image_base64,
            created_by_id: q.created_by_id,
            created_by_email: q.created_by_email,
            created_at: opt_ts_to_iso(&q.created_at).unwrap_or_default(),
            answers: q.answers.into_iter().map(Into::into).collect(),
        }
    }
}

/// `{text, is_correct}` — та же форма, в которой формы редактора уже
/// собирают ответы (см. api.js createQuestion/updateQuestion: "answers,
/// // [{text, is_correct}]"), поэтому фронтенду не нужно ничего
/// переупаковывать перед вызовом.
#[derive(serde::Deserialize)]
pub struct AnswerInputJs {
    pub text: String,
    pub is_correct: bool,
}

impl From<AnswerInputJs> for pb::AnswerInput {
    fn from(a: AnswerInputJs) -> Self {
        pb::AnswerInput { text: a.text, is_correct: a.is_correct }
    }
}

#[tauri::command]
pub async fn list_chapters(channel: State<'_, GrpcChannel>, token: Option<String>) -> CmdResult<Vec<ChapterOut>> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ListChaptersRequest {}, &token)?;
    let resp = client.list_chapters(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.chapters.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn create_chapter(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    title: String,
    description: Option<String>,
    order: i32,
) -> CmdResult<ChapterOut> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(pb::CreateChapterRequest { title, description, order }, &token)?;
    let resp = client.create_chapter(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

/// `order` — необязателен и по умолчанию отсутствует: как и раньше, обычное
/// редактирование главы (title/description) не трогает порядок; presence
/// этого поля на сервере — то, что отличает "не менять порядок" от
/// "поменять порядок" (последнее разрешено только admin, см.
/// api_migration_map.md).
#[tauri::command]
pub async fn update_chapter(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    chapter_id: i64,
    title: Option<String>,
    description: Option<String>,
    order: Option<i32>,
) -> CmdResult<ChapterOut> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(
        pb::UpdateChapterRequest { chapter_id, title, description, order },
        &token,
    )?;
    let resp = client.update_chapter(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn delete_chapter(channel: State<'_, GrpcChannel>, token: Option<String>, chapter_id: i64) -> CmdResult<()> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(pb::DeleteChapterRequest { chapter_id }, &token)?;
    client.delete_chapter(req).await.map_err(status_to_js)?;
    Ok(())
}

/// Свой (увеличенный) таймаут — глава может нести все фото своих вопросов
/// (аналог QUESTIONS_FETCH_TIMEOUT_MS в старом config.js), только теперь
/// это таймаут не на один большой ответ, а на весь стрим целиком (от
/// открытия до сообщения о том, что вопросы кончились).
///
/// `ListQuestions` на сервере — server-streaming RPC: вопросы приходят по
/// сети по одному, каждый отдельным gRPC-сообщением, а не все разом одним
/// большим Response. Здесь это отражено через `tauri::ipc::Channel`
/// (`on_event`) — каждый вопрос, дошедший по gRPC-стриму, тут же, без
/// накопления в Vec, уходит `on_event.send(...)` дальше в JS отдельным IPC-
/// сообщением (см. requestQuestionsWithProgress в src/lib/api/api.js). Сама
/// команда возвращает `()`: полный список вопросов на JS-стороне собирают
/// уже из пришедших по каналу сообщений, а не из результата invoke —
/// незачем гонять один и тот же вопрос по IPC дважды.
#[tauri::command]
pub async fn list_questions(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    chapter_id: i64,
    on_event: tauri::ipc::Channel<QuestionOut>,
) -> CmdResult<()> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let mut req = auth_request(pb::ListQuestionsRequest { chapter_id }, &token)?;
    req.set_timeout(std::time::Duration::from_secs(45));
    let mut stream = client.list_questions(req).await.map_err(status_to_js)?.into_inner();
    // `.message()` вместо `StreamExt::next()` — тянет по одному сообщению
    // из tonic::Streaming без лишней зависимости от futures/tokio-stream
    // на клиенте (её тут и так не было, см. Cargo.toml).
    while let Some(question) = stream.message().await.map_err(status_to_js)? {
        on_event
            .send(QuestionOut::from(question))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_question(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    chapter_id: i64,
    text: String,
    order: i32,
    hint: Option<String>,
    image_base64: Option<String>,
    answers: Vec<AnswerInputJs>,
) -> CmdResult<QuestionOut> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(
        pb::CreateQuestionRequest {
            chapter_id,
            text,
            order,
            hint,
            image_base64,
            answers: answers.into_iter().map(Into::into).collect(),
        },
        &token,
    )?;
    let resp = client.create_question(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

/// `answers_provided` — отдельный флаг вместо presence самого `answers`
/// (proto3 `optional` не поддерживает `repeated`, см.
/// api_migration_map.md): `true` — заменить ответы новым списком (даже
/// пустым, хотя сервер такое отклонит), `false`/не передан — не трогать
/// ответы вовсе.
#[tauri::command]
pub async fn update_question(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    chapter_id: i64,
    question_id: i64,
    text: Option<String>,
    order: Option<i32>,
    hint: Option<String>,
    image_base64: Option<String>,
    answers: Vec<AnswerInputJs>,
    answers_provided: bool,
) -> CmdResult<QuestionOut> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(
        pb::UpdateQuestionRequest {
            chapter_id,
            question_id,
            text,
            order,
            hint,
            image_base64,
            answers: answers.into_iter().map(Into::into).collect(),
            answers_provided,
        },
        &token,
    )?;
    let resp = client.update_question(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn delete_question(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    chapter_id: i64,
    question_id: i64,
) -> CmdResult<()> {
    let mut client = pb::content_service_client::ContentServiceClient::new(channel.channel().await);
    let req = auth_request(pb::DeleteQuestionRequest { chapter_id, question_id }, &token)?;
    client.delete_question(req).await.map_err(status_to_js)?;
    Ok(())
}

/* ============================================================
   ЛИЦЕНЗИИ (admin)
   ============================================================ */

#[derive(Serialize)]
pub struct LicenseOut {
    pub id: i64,
    pub product_key: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub license_until: String,
    pub user_type: String,
    pub is_blocked: bool,
    pub max_devices: i32,
    pub device_count: i32,
    pub settings: JValue,
    pub payment_info: JValue,
}

impl From<pb::License> for LicenseOut {
    fn from(l: pb::License) -> Self {
        LicenseOut {
            id: l.id,
            product_key: l.product_key,
            email: l.email,
            first_name: l.first_name,
            last_name: l.last_name,
            license_until: opt_ts_to_iso(&l.license_until).unwrap_or_default(),
            user_type: l.user_type,
            is_blocked: l.is_blocked,
            max_devices: l.max_devices,
            device_count: l.device_count,
            settings: l.settings.map(|s| struct_to_json(&s)).unwrap_or(JValue::Object(Default::default())),
            payment_info: l.payment_info.map(|s| struct_to_json(&s)).unwrap_or(JValue::Object(Default::default())),
        }
    }
}

#[tauri::command]
pub async fn list_licenses(channel: State<'_, GrpcChannel>, token: Option<String>) -> CmdResult<Vec<LicenseOut>> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ListLicensesRequest {}, &token)?;
    let resp = client.list_licenses(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.licenses.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn create_license(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    user_type: String,
    email: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    license_days: i32,
    max_devices: i32,
) -> CmdResult<LicenseOut> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(
        pb::CreateLicenseRequest {
            license_days,
            email,
            first_name,
            last_name,
            user_type,
            payment_info: Some(prost_types::Struct { fields: Default::default() }),
            max_devices,
        },
        &token,
    )?;
    let resp = client.create_license(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn extend_license(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    user_id: i64,
    extra_days: i32,
) -> CmdResult<LicenseOut> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ExtendLicenseRequest { user_id, extra_days }, &token)?;
    let resp = client.extend_license(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn block_license(channel: State<'_, GrpcChannel>, token: Option<String>, user_id: i64) -> CmdResult<LicenseOut> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::BlockLicenseRequest { user_id }, &token)?;
    let resp = client.block_license(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn unblock_license(channel: State<'_, GrpcChannel>, token: Option<String>, user_id: i64) -> CmdResult<LicenseOut> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::UnblockLicenseRequest { user_id }, &token)?;
    let resp = client.unblock_license(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn reset_device(channel: State<'_, GrpcChannel>, token: Option<String>, user_id: i64) -> CmdResult<LicenseOut> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ResetDeviceRequest { user_id }, &token)?;
    let resp = client.reset_device(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn delete_license(channel: State<'_, GrpcChannel>, token: Option<String>, user_id: i64) -> CmdResult<()> {
    let mut client = pb::admin_service_client::AdminServiceClient::new(channel.channel().await);
    let req = auth_request(pb::DeleteLicenseRequest { user_id }, &token)?;
    client.delete_license(req).await.map_err(status_to_js)?;
    Ok(())
}

/* ============================================================
   ДРУЗЬЯ
   ============================================================ */

#[derive(Serialize)]
pub struct FriendUserOut {
    pub id: i64,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

impl From<pb::FriendUser> for FriendUserOut {
    fn from(u: pb::FriendUser) -> Self {
        FriendUserOut { id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name }
    }
}

#[derive(Serialize)]
pub struct FriendshipOut {
    pub id: i64,
    pub status: String,
    pub created_at: String,
    pub responded_at: Option<String>,
    pub requester: Option<FriendUserOut>,
    pub addressee: Option<FriendUserOut>,
}

impl From<pb::Friendship> for FriendshipOut {
    fn from(f: pb::Friendship) -> Self {
        FriendshipOut {
            id: f.id,
            status: f.status,
            created_at: opt_ts_to_iso(&f.created_at).unwrap_or_default(),
            responded_at: opt_ts_to_iso(&f.responded_at),
            requester: f.requester.map(Into::into),
            addressee: f.addressee.map(Into::into),
        }
    }
}

#[tauri::command]
pub async fn send_friend_request(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    email: String,
) -> CmdResult<FriendshipOut> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::SendFriendRequestRequest { email }, &token)?;
    let resp = client.send_request(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn list_incoming_friend_requests(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
) -> CmdResult<Vec<FriendshipOut>> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ListIncomingRequest {}, &token)?;
    let resp = client.list_incoming(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.friendships.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn list_outgoing_friend_requests(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
) -> CmdResult<Vec<FriendshipOut>> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ListOutgoingRequest {}, &token)?;
    let resp = client.list_outgoing(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.friendships.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn accept_friend_request(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    friendship_id: i64,
) -> CmdResult<FriendshipOut> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::AcceptFriendRequestRequest { friendship_id }, &token)?;
    let resp = client.accept(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.into())
}

#[tauri::command]
pub async fn remove_friendship(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
    friendship_id: i64,
) -> CmdResult<()> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::RemoveFriendshipRequest { friendship_id }, &token)?;
    client.remove(req).await.map_err(status_to_js)?;
    Ok(())
}

#[tauri::command]
pub async fn list_friends(channel: State<'_, GrpcChannel>, token: Option<String>) -> CmdResult<Vec<FriendshipOut>> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::ListFriendsRequest {}, &token)?;
    let resp = client.list_friends(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.friendships.into_iter().map(Into::into).collect())
}

#[derive(Serialize)]
pub struct LeaderboardEntryOut {
    pub user_id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub profile_photo: Option<String>,
    pub points: i32,
    pub is_me: bool,
}

impl From<pb::LeaderboardEntry> for LeaderboardEntryOut {
    fn from(e: pb::LeaderboardEntry) -> Self {
        LeaderboardEntryOut {
            user_id: e.user_id,
            first_name: e.first_name,
            last_name: e.last_name,
            email: e.email,
            profile_photo: e.profile_photo,
            points: e.points,
            is_me: e.is_me,
        }
    }
}

#[tauri::command]
pub async fn get_leaderboard(
    channel: State<'_, GrpcChannel>,
    token: Option<String>,
) -> CmdResult<Vec<LeaderboardEntryOut>> {
    let mut client = pb::friends_service_client::FriendsServiceClient::new(channel.channel().await);
    let req = auth_request(pb::LeaderboardRequest {}, &token)?;
    let resp = client.leaderboard(req).await.map_err(status_to_js)?.into_inner();
    Ok(resp.entries.into_iter().map(Into::into).collect())
}

/* ============================================================
   HEALTH — стандартный grpc.health.v1.Health (сервер поднимает его через
   tonic-health, см. api_migration_map.md/roadwits-server). Замена старому
   GET /health.
   ============================================================ */

#[derive(Serialize)]
pub struct HealthOut {
    pub status: String,
}

#[tauri::command]
pub async fn health(channel: State<'_, GrpcChannel>) -> CmdResult<HealthOut> {
    let mut client = tonic_health::pb::health_client::HealthClient::new(channel.channel().await);
    let mut req = tonic::Request::new(tonic_health::pb::HealthCheckRequest { service: String::new() });
    req.set_timeout(std::time::Duration::from_secs(5));
    let resp = client.check(req).await.map_err(status_to_js)?.into_inner();
    let status = if resp.status == tonic_health::pb::health_check_response::ServingStatus::Serving as i32 {
        "ok"
    } else {
        "degraded"
    };
    Ok(HealthOut { status: status.to_string() })
}
