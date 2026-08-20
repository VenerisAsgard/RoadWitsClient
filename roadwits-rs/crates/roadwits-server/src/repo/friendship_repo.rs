use chrono::Utc;
use sqlx::PgPool;

use crate::db::models::{FriendshipRow, FriendshipStatus};
use crate::error::AppResult;

pub async fn get_by_id(pool: &PgPool, friendship_id: i64) -> AppResult<Option<FriendshipRow>> {
    let row = sqlx::query_as!(
        FriendshipRow,
        r#"SELECT id, requester_id, addressee_id, status as "status: FriendshipStatus",
                  created_at, responded_at
           FROM friendships WHERE id = $1"#,
        friendship_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Находит связь между двумя пользователями независимо от того, кто кому её отправил.
pub async fn get_between(
    pool: &PgPool,
    user_a_id: i64,
    user_b_id: i64,
) -> AppResult<Option<FriendshipRow>> {
    let row = sqlx::query_as!(
        FriendshipRow,
        r#"SELECT id, requester_id, addressee_id, status as "status: FriendshipStatus",
                  created_at, responded_at
           FROM friendships
           WHERE (requester_id = $1 AND addressee_id = $2)
              OR (requester_id = $2 AND addressee_id = $1)"#,
        user_a_id,
        user_b_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn create_request(
    pool: &PgPool,
    requester_id: i64,
    addressee_id: i64,
) -> AppResult<FriendshipRow> {
    let row = sqlx::query_as!(
        FriendshipRow,
        r#"INSERT INTO friendships (requester_id, addressee_id, status)
           VALUES ($1, $2, 'pending')
           RETURNING id, requester_id, addressee_id, status as "status: FriendshipStatus",
                     created_at, responded_at"#,
        requester_id,
        addressee_id
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn accept(pool: &PgPool, friendship_id: i64) -> AppResult<FriendshipRow> {
    let now = Utc::now();
    let row = sqlx::query_as!(
        FriendshipRow,
        r#"UPDATE friendships SET status = 'accepted', responded_at = $2
           WHERE id = $1
           RETURNING id, requester_id, addressee_id, status as "status: FriendshipStatus",
                     created_at, responded_at"#,
        friendship_id,
        now
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn delete(pool: &PgPool, friendship_id: i64) -> AppResult<()> {
    sqlx::query!("DELETE FROM friendships WHERE id = $1", friendship_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_incoming_pending(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    let rows = sqlx::query_as!(
        FriendshipRow,
        r#"SELECT id, requester_id, addressee_id, status as "status: FriendshipStatus",
                  created_at, responded_at
           FROM friendships WHERE addressee_id = $1 AND status = 'pending'"#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_outgoing_pending(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    let rows = sqlx::query_as!(
        FriendshipRow,
        r#"SELECT id, requester_id, addressee_id, status as "status: FriendshipStatus",
                  created_at, responded_at
           FROM friendships WHERE requester_id = $1 AND status = 'pending'"#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_accepted(pool: &PgPool, user_id: i64) -> AppResult<Vec<FriendshipRow>> {
    let rows = sqlx::query_as!(
        FriendshipRow,
        r#"SELECT id, requester_id, addressee_id, status as "status: FriendshipStatus",
                  created_at, responded_at
           FROM friendships
           WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'accepted'"#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
