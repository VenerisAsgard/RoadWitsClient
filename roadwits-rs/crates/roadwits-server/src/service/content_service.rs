use sqlx::PgPool;

use crate::db::models::{ChapterRow, QuestionRow};
use crate::error::{AppError, AppResult};
use crate::repo::{chapter_repo, question_repo};

pub async fn list_chapters(pool: &PgPool) -> AppResult<Vec<ChapterRow>> {
    chapter_repo::list_all(pool).await
}

pub async fn create_chapter(
    pool: &PgPool,
    title: &str,
    description: Option<&str>,
    order: i32,
    created_by_id: Option<i64>,
) -> AppResult<ChapterRow> {
    chapter_repo::create(pool, title, description, order, created_by_id).await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_chapter(
    pool: &PgPool,
    chapter_id: i64,
    title: Option<&str>,
    description: Option<&str>,
    description_provided: bool,
    order: Option<i32>,
) -> AppResult<ChapterRow> {
    chapter_repo::update(pool, chapter_id, title, description, description_provided, order).await
}

pub async fn delete_chapter(pool: &PgPool, chapter_id: i64) -> AppResult<()> {
    chapter_repo::delete(pool, chapter_id).await
}

pub async fn get_chapter_questions(pool: &PgPool, chapter_id: i64) -> AppResult<Vec<QuestionRow>> {
    question_repo::list_by_chapter(pool, chapter_id).await
}

/// Единственное правило целостности заданий, которое сервер проверяет:
/// минимум 2 варианта и ровно один правильный (см. _validate_answers в оригинале).
pub fn validate_answers(answers: &[(String, bool)]) -> AppResult<()> {
    if answers.len() < 2 {
        return Err(AppError::Content("Нужно минимум 2 варианта ответа".to_string()));
    }
    let correct_count = answers.iter().filter(|(_, is_correct)| *is_correct).count();
    if correct_count != 1 {
        return Err(AppError::Content(
            "Ровно один вариант ответа должен быть отмечен как правильный".to_string(),
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn create_question(
    pool: &PgPool,
    chapter_id: i64,
    text: &str,
    order: i32,
    hint: Option<&str>,
    image_base64: Option<&str>,
    answers: &[(String, bool)],
    created_by_id: Option<i64>,
) -> AppResult<QuestionRow> {
    validate_answers(answers)?;
    question_repo::create_question_with_answers(
        pool,
        chapter_id,
        text,
        order,
        hint,
        image_base64,
        created_by_id,
        answers,
    )
    .await
}

/// Простые поля обновляются частично; answers, если переданы, полностью
/// заменяют набор (инвариант "ровно один is_correct" иначе не гарантировать).
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
    if let Some(answers) = answers {
        validate_answers(answers)?;
    }
    question_repo::update_question(
        pool,
        question_id,
        text,
        order,
        hint,
        hint_provided,
        image_base64,
        image_provided,
        answers,
    )
    .await
}

pub async fn delete_question(pool: &PgPool, question_id: i64) -> AppResult<()> {
    question_repo::delete_question(pool, question_id).await
}
