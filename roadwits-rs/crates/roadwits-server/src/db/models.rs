use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "user_type", rename_all = "lowercase")]
pub enum UserType {
    Admin,
    Editor,
    Student,
}

impl UserType {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserType::Admin => "admin",
            UserType::Editor => "editor",
            UserType::Student => "student",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "admin" => Some(UserType::Admin),
            "editor" => Some(UserType::Editor),
            "student" => Some(UserType::Student),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "friendship_status", rename_all = "lowercase")]
pub enum FriendshipStatus {
    Pending,
    Accepted,
}

impl FriendshipStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            FriendshipStatus::Pending => "pending",
            FriendshipStatus::Accepted => "accepted",
        }
    }
}

#[derive(Debug, Clone, FromRow)]
pub struct UserRow {
    pub id: i64,
    pub product_key: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub license_until: DateTime<Utc>,
    pub user_type: UserType,
    pub is_blocked: bool,
    pub profile_photo: Option<String>,
    pub settings: sqlx::types::Json<serde_json::Value>,
    pub payment_info: sqlx::types::Json<serde_json::Value>,
    pub max_devices: i32,
}

#[derive(Debug, Clone, FromRow)]
pub struct DeviceRow {
    pub id: i64,
    pub fingerprint: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
pub struct ChapterRow {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub order: i32,
    pub created_by_id: Option<i64>,
    // Не колонка — подтягивается JOIN'ом (см. chapter_repository::list_all),
    // аналог свойства Chapter.created_by_email в оригинале.
    pub created_by_email: Option<String>,
    pub question_count: i64,
}

#[derive(Debug, Clone, FromRow)]
pub struct QuestionRow {
    pub id: i64,
    pub chapter_id: i64,
    pub text: String,
    pub order: i32,
    pub hint: Option<String>,
    pub image_base64: Option<String>,
    pub created_by_id: Option<i64>,
    pub created_by_email: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct AnswerRow {
    pub id: i64,
    pub question_id: i64,
    pub text: String,
    pub is_correct: bool,
}

#[derive(Debug, Clone, FromRow)]
pub struct FriendshipRow {
    pub id: i64,
    pub requester_id: i64,
    pub addressee_id: i64,
    pub status: FriendshipStatus,
    pub created_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
}
