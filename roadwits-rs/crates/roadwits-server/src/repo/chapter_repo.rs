use sqlx::PgPool;

use crate::db::models::ChapterRow;
use crate::error::AppResult;

const SELECT_CHAPTER: &str = r#"
    SELECT c.id, c.title, c.description, c."order", c.created_by_id,
           u.email as created_by_email,
           (SELECT COUNT(*) FROM questions q WHERE q.chapter_id = c.id) as question_count
    FROM chapters c
    LEFT JOIN users u ON u.id = c.created_by_id
"#;

pub async fn list_all(pool: &PgPool) -> AppResult<Vec<ChapterRow>> {
    let sql = format!("{SELECT_CHAPTER} ORDER BY c.\"order\"");
    let rows = sqlx::query_as::<_, ChapterRow>(&sql).fetch_all(pool).await?;
    Ok(rows)
}

pub async fn get_by_id(pool: &PgPool, chapter_id: i64) -> AppResult<Option<ChapterRow>> {
    let sql = format!("{SELECT_CHAPTER} WHERE c.id = $1");
    let row = sqlx::query_as::<_, ChapterRow>(&sql)
        .bind(chapter_id)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn create(
    pool: &PgPool,
    title: &str,
    description: Option<&str>,
    order: i32,
    created_by_id: Option<i64>,
) -> AppResult<ChapterRow> {
    // insert + re-read в одной транзакции: если re-read почему-то упадет,
    // insert должен откатиться, а не остаться "осиротевшей" строкой.
    let mut tx = pool.begin().await?;
    let id = sqlx::query_scalar!(
        r#"INSERT INTO chapters (title, description, "order", created_by_id)
           VALUES ($1, $2, $3, $4) RETURNING id"#,
        title,
        description,
        order,
        created_by_id,
    )
    .fetch_one(&mut *tx)
    .await?;
    let sql = format!("{SELECT_CHAPTER} WHERE c.id = $1");
    let row = sqlx::query_as::<_, ChapterRow>(&sql)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Обновляет только переданные (Some) поля — как chapter_repository.update
/// в оригинале, где None-поля пропускаются, не затирая существующее значение.
pub async fn update(
    pool: &PgPool,
    chapter_id: i64,
    title: Option<&str>,
    description: Option<&str>,
    description_provided: bool,
    order: Option<i32>,
) -> AppResult<ChapterRow> {
    if let Some(title) = title {
        sqlx::query!("UPDATE chapters SET title = $2 WHERE id = $1", chapter_id, title)
            .execute(pool)
            .await?;
    }
    if description_provided {
        sqlx::query!(
            "UPDATE chapters SET description = $2 WHERE id = $1",
            chapter_id,
            description
        )
        .execute(pool)
        .await?;
    }
    if let Some(order) = order {
        sqlx::query!(
            r#"UPDATE chapters SET "order" = $2 WHERE id = $1"#,
            chapter_id,
            order
        )
        .execute(pool)
        .await?;
    }
    Ok(get_by_id(pool, chapter_id).await?.expect("chapter exists"))
}

pub async fn delete(pool: &PgPool, chapter_id: i64) -> AppResult<()> {
    // ON DELETE CASCADE на questions/answers — как cascade="all, delete-orphan" в оригинале.
    sqlx::query!("DELETE FROM chapters WHERE id = $1", chapter_id)
        .execute(pool)
        .await?;
    Ok(())
}
