use sqlx::PgPool;

use crate::db::models::{AnswerRow, QuestionRow};
use crate::error::AppResult;

const SELECT_QUESTION: &str = r#"
    SELECT q.id, q.chapter_id, q.text, q."order", q.hint, q.image_base64,
           q.created_by_id, u.email as created_by_email, q.created_at
    FROM questions q
    LEFT JOIN users u ON u.id = q.created_by_id
"#;

pub async fn list_by_chapter(pool: &PgPool, chapter_id: i64) -> AppResult<Vec<QuestionRow>> {
    let sql = format!("{SELECT_QUESTION} WHERE q.chapter_id = $1 ORDER BY q.\"order\"");
    let rows = sqlx::query_as::<_, QuestionRow>(&sql)
        .bind(chapter_id)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

pub async fn get_by_id(pool: &PgPool, question_id: i64) -> AppResult<Option<QuestionRow>> {
    let sql = format!("{SELECT_QUESTION} WHERE q.id = $1");
    let row = sqlx::query_as::<_, QuestionRow>(&sql)
        .bind(question_id)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn list_answers(pool: &PgPool, question_id: i64) -> AppResult<Vec<AnswerRow>> {
    let rows = sqlx::query_as!(
        AnswerRow,
        r#"SELECT id, question_id, text, is_correct FROM answers WHERE question_id = $1 ORDER BY id"#,
        question_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Создает вопрос и его варианты ответа одной транзакцией: если запись
/// ответов не удалась, вопрос не должен быть создан наполовину (без единого
/// варианта — что нарушает инвариант "минимум 2 варианта, один правильный").
#[allow(clippy::too_many_arguments)]
pub async fn create_question_with_answers(
    pool: &PgPool,
    chapter_id: i64,
    text: &str,
    order: i32,
    hint: Option<&str>,
    image_base64: Option<&str>,
    created_by_id: Option<i64>,
    answers: &[(String, bool)],
) -> AppResult<QuestionRow> {
    let mut tx = pool.begin().await?;
    let id = sqlx::query_scalar!(
        r#"INSERT INTO questions (chapter_id, text, "order", hint, image_base64, created_by_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"#,
        chapter_id,
        text,
        order,
        hint,
        image_base64,
        created_by_id,
    )
    .fetch_one(&mut *tx)
    .await?;
    for (a_text, is_correct) in answers {
        sqlx::query!(
            "INSERT INTO answers (question_id, text, is_correct) VALUES ($1, $2, $3)",
            id,
            a_text,
            is_correct,
        )
        .execute(&mut *tx)
        .await?;
    }
    let sql = format!("{SELECT_QUESTION} WHERE q.id = $1");
    let row = sqlx::query_as::<_, QuestionRow>(&sql)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

#[allow(clippy::too_many_arguments)]
pub async fn update_question(
    pool: &PgPool,
    question_id: i64,
    text: Option<&str>,
    order: Option<i32>,
    hint: Option<&str>,
    hint_provided: bool,
    image_base64: Option<&str>,
    image_provided: bool,
    answers: Option<&[(String, bool)]>,
) -> AppResult<QuestionRow> {
    let mut tx = pool.begin().await?;
    if let Some(text) = text {
        sqlx::query!("UPDATE questions SET text = $2 WHERE id = $1", question_id, text)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(order) = order {
        sqlx::query!(
            r#"UPDATE questions SET "order" = $2 WHERE id = $1"#,
            question_id,
            order
        )
        .execute(&mut *tx)
        .await?;
    }
    if hint_provided {
        sqlx::query!("UPDATE questions SET hint = $2 WHERE id = $1", question_id, hint)
            .execute(&mut *tx)
            .await?;
    }
    if image_provided {
        sqlx::query!(
            "UPDATE questions SET image_base64 = $2 WHERE id = $1",
            question_id,
            image_base64
        )
        .execute(&mut *tx)
        .await?;
    }
    if let Some(answers) = answers {
        // Валидация (мин. 2 варианта, ровно один правильный) уже прошла
        // выше по стеку (content_service::validate_answers), здесь только
        // атомарная замена — в одной транзакции с остальными полями.
        sqlx::query!("DELETE FROM answers WHERE question_id = $1", question_id)
            .execute(&mut *tx)
            .await?;
        for (a_text, is_correct) in answers {
            sqlx::query!(
                "INSERT INTO answers (question_id, text, is_correct) VALUES ($1, $2, $3)",
                question_id,
                a_text,
                is_correct,
            )
            .execute(&mut *tx)
            .await?;
        }
    }
    let sql = format!("{SELECT_QUESTION} WHERE q.id = $1");
    let row = sqlx::query_as::<_, QuestionRow>(&sql)
        .bind(question_id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

pub async fn delete_question(pool: &PgPool, question_id: i64) -> AppResult<()> {
    sqlx::query!("DELETE FROM questions WHERE id = $1", question_id)
        .execute(pool)
        .await?;
    Ok(())
}
