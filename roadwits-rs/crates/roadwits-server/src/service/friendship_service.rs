use sqlx::PgPool;

use crate::db::models::{FriendshipRow, FriendshipStatus, UserRow};
use crate::error::{AppError, AppResult};
use crate::repo::{friendship_repo, user_repo};

pub async fn send_request(
    pool: &PgPool,
    requester: &UserRow,
    addressee_email: &str,
) -> AppResult<FriendshipRow> {
    let addressee = user_repo::get_by_email(pool, addressee_email)
        .await?
        .ok_or_else(|| AppError::Friendship("Пользователь с таким email не найден".to_string()))?;

    if addressee.id == requester.id {
        return Err(AppError::Friendship(
            "Нельзя добавить в друзья самого себя".to_string(),
        ));
    }

    if let Some(existing) = friendship_repo::get_between(pool, requester.id, addressee.id).await? {
        return Err(AppError::Friendship(
            if existing.status == FriendshipStatus::Accepted {
                "Вы уже друзья".to_string()
            } else {
                "Заявка уже отправлена и ожидает ответа".to_string()
            },
        ));
    }

    friendship_repo::create_request(pool, requester.id, addressee.id).await
}

pub async fn accept_request(
    pool: &PgPool,
    current_user_id: i64,
    friendship_id: i64,
) -> AppResult<FriendshipRow> {
    let friendship = friendship_repo::get_by_id(pool, friendship_id)
        .await?
        .ok_or(AppError::FriendshipNotFound)?;
    if friendship.addressee_id != current_user_id {
        return Err(AppError::NotAddressee);
    }
    if friendship.status == FriendshipStatus::Accepted {
        return Err(AppError::Friendship("Заявка уже принята".to_string()));
    }
    friendship_repo::accept(pool, friendship_id).await
}

/// Отклонить входящую заявку, отозвать исходящую или удалить принятую
/// дружбу — один и тот же метод: любая из двух сторон может разорвать связь
/// в любом её статусе.
pub async fn remove(pool: &PgPool, current_user_id: i64, friendship_id: i64) -> AppResult<()> {
    let friendship = friendship_repo::get_by_id(pool, friendship_id)
        .await?
        .ok_or(AppError::FriendshipNotFound)?;
    if current_user_id != friendship.requester_id && current_user_id != friendship.addressee_id {
        return Err(AppError::NotYourFriendship);
    }
    friendship_repo::delete(pool, friendship_id).await
}

pub async fn list_incoming(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    friendship_repo::list_incoming_pending(pool, user_id).await
}

pub async fn list_outgoing(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    friendship_repo::list_outgoing_pending(pool, user_id).await
}

pub async fn list_friends(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    friendship_repo::list_accepted(pool, user_id).await
}

/// Баллы — сумма правильных ответов ("answered") по всем ключам
/// settings.quiz_stats, которые клиент копит при каждом завершении теста.
/// Отдельной таблицы результатов нет — см. friendship_service._points_of
/// в оригинале.
pub fn points_of(settings: &serde_json::Value) -> i64 {
    let Some(stats) = settings.get("quiz_stats").and_then(|v| v.as_object()) else {
        return 0;
    };
    stats
        .values()
        .filter_map(|entry| entry.as_object())
        .filter_map(|entry| entry.get("answered"))
        .filter_map(|v| v.as_i64())
        .sum()
}

pub struct LeaderboardEntry {
    pub user_id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub profile_photo: Option<String>,
    pub points: i64,
    pub is_me: bool,
}

/// Себя + всех принятых друзей, отсортированные по баллам по убыванию.
pub async fn leaderboard(pool: &PgPool, user: &UserRow) -> AppResult<Vec<LeaderboardEntry>> {
    let friendships = friendship_repo::list_accepted(pool, user.id).await?;

    let mut people: Vec<UserRow> = vec![user.clone()];
    for f in &friendships {
        let partner_id = if f.requester_id == user.id {
            f.addressee_id
        } else {
            f.requester_id
        };
        if partner_id != user.id && !people.iter().any(|p| p.id == partner_id) {
            if let Some(partner) = user_repo::get_by_id(pool, partner_id).await? {
                people.push(partner);
            }
        }
    }

    let mut entries: Vec<LeaderboardEntry> = people
        .into_iter()
        .map(|person| LeaderboardEntry {
            user_id: person.id,
            first_name: person.first_name.clone(),
            last_name: person.last_name.clone(),
            email: person.email.clone(),
            profile_photo: person.profile_photo.clone(),
            points: points_of(&person.settings.0),
            is_me: person.id == user.id,
        })
        .collect();

    entries.sort_by(|a, b| b.points.cmp(&a.points));
    Ok(entries)
}
