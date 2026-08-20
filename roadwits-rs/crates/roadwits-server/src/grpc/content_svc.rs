use sqlx::PgPool;
use tonic::{Request, Response, Status};

use roadwits_proto::v1::content_service_server::ContentService as ContentServiceTrait;
use roadwits_proto::v1::{
    Answer as PbAnswer, Chapter as PbChapter, CreateChapterRequest, CreateQuestionRequest,
    DeleteChapterRequest, DeleteChapterResponse, DeleteQuestionRequest, DeleteQuestionResponse,
    GetQuestionRequest, ListChaptersRequest, ListChaptersResponse, ListQuestionsRequest,
    ListQuestionsResponse, Question as PbQuestion, UpdateChapterRequest, UpdateQuestionRequest,
};

use crate::auth_ctx;
use crate::config::Config;
use crate::db::models::{AnswerRow, ChapterRow, QuestionRow, UserType};
use crate::error::AppError;
use crate::repo::question_repo;
use crate::service::content_service;
use crate::util::time::to_timestamp;

pub struct ContentSvc {
    pub pool: PgPool,
    pub cfg: Config,
}

fn to_pb_chapter(row: &ChapterRow) -> PbChapter {
    PbChapter {
        id: row.id,
        title: row.title.clone(),
        description: row.description.clone(),
        order: row.order,
        question_count: row.question_count as i32,
        created_by_id: row.created_by_id,
        created_by_email: row.created_by_email.clone(),
    }
}

fn to_pb_answer(row: &AnswerRow) -> PbAnswer {
    PbAnswer {
        id: row.id,
        text: row.text.clone(),
        is_correct: row.is_correct,
    }
}

async fn to_pb_question(pool: &PgPool, row: &QuestionRow) -> Result<PbQuestion, AppError> {
    let answers = question_repo::list_answers(pool, row.id).await?;
    Ok(PbQuestion {
        id: row.id,
        chapter_id: row.chapter_id,
        text: row.text.clone(),
        order: row.order,
        hint: row.hint.clone(),
        image_base64: row.image_base64.clone(),
        created_by_id: row.created_by_id,
        created_by_email: row.created_by_email.clone(),
        created_at: Some(to_timestamp(row.created_at)),
        answers: answers.iter().map(to_pb_answer).collect(),
    })
}

#[tonic::async_trait]
impl ContentServiceTrait for ContentSvc {
    async fn list_chapters(
        &self,
        request: Request<ListChaptersRequest>,
    ) -> Result<Response<ListChaptersResponse>, Status> {
        auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let chapters = content_service::list_chapters(&self.pool).await?;
        Ok(Response::new(ListChaptersResponse {
            chapters: chapters.iter().map(to_pb_chapter).collect(),
        }))
    }

    async fn create_chapter(
        &self,
        request: Request<CreateChapterRequest>,
    ) -> Result<Response<PbChapter>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_editor_or_admin(&user)?;
        let payload = request.into_inner();
        let chapter = content_service::create_chapter(
            &self.pool,
            &payload.title,
            payload.description.as_deref(),
            payload.order,
            Some(user.id),
        )
        .await?;
        Ok(Response::new(to_pb_chapter(&chapter)))
    }

    async fn update_chapter(
        &self,
        request: Request<UpdateChapterRequest>,
    ) -> Result<Response<PbChapter>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_editor_or_admin(&user)?;
        let payload = request.into_inner();

        // order присутствует в запросе (proto3 optional) <=> клиент реально
        // просит сменить порядок — это разрешено только admin.
        if payload.order.is_some() && user.user_type == UserType::Editor {
            return Err(AppError::EditorCannotReorder.into());
        }

        let description_provided = payload.description.is_some();
        let chapter = content_service::update_chapter(
            &self.pool,
            payload.chapter_id,
            payload.title.as_deref(),
            payload.description.as_deref(),
            description_provided,
            payload.order,
        )
        .await?;
        Ok(Response::new(to_pb_chapter(&chapter)))
    }

    async fn delete_chapter(
        &self,
        request: Request<DeleteChapterRequest>,
    ) -> Result<Response<DeleteChapterResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&user)?;
        let payload = request.into_inner();
        content_service::delete_chapter(&self.pool, payload.chapter_id).await?;
        Ok(Response::new(DeleteChapterResponse {}))
    }

    async fn list_questions(
        &self,
        request: Request<ListQuestionsRequest>,
    ) -> Result<Response<ListQuestionsResponse>, Status> {
        auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let payload = request.into_inner();
        let questions = content_service::get_chapter_questions(&self.pool, payload.chapter_id).await?;
        let mut pb_questions = Vec::with_capacity(questions.len());
        for q in &questions {
            pb_questions.push(to_pb_question(&self.pool, q).await?);
        }
        Ok(Response::new(ListQuestionsResponse {
            questions: pb_questions,
        }))
    }

    async fn get_question(
        &self,
        request: Request<GetQuestionRequest>,
    ) -> Result<Response<PbQuestion>, Status> {
        auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let payload = request.into_inner();
        let question = question_repo::get_by_id(&self.pool, payload.question_id)
            .await?
            .filter(|q| q.chapter_id == payload.chapter_id)
            .ok_or(AppError::QuestionNotFound)?;
        Ok(Response::new(to_pb_question(&self.pool, &question).await?))
    }

    async fn create_question(
        &self,
        request: Request<CreateQuestionRequest>,
    ) -> Result<Response<PbQuestion>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_editor_or_admin(&user)?;
        let payload = request.into_inner();
        let answers: Vec<(String, bool)> = payload
            .answers
            .into_iter()
            .map(|a| (a.text, a.is_correct))
            .collect();
        let question = content_service::create_question(
            &self.pool,
            payload.chapter_id,
            &payload.text,
            payload.order,
            payload.hint.as_deref(),
            payload.image_base64.as_deref(),
            &answers,
            Some(user.id),
        )
        .await?;
        Ok(Response::new(to_pb_question(&self.pool, &question).await?))
    }

    async fn update_question(
        &self,
        request: Request<UpdateQuestionRequest>,
    ) -> Result<Response<PbQuestion>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_editor_or_admin(&user)?;
        let payload = request.into_inner();

        let hint_provided = payload.hint.is_some();
        let image_provided = payload.image_base64.is_some();
        let answers: Option<Vec<(String, bool)>> = if payload.answers_provided {
            Some(
                payload
                    .answers
                    .into_iter()
                    .map(|a| (a.text, a.is_correct))
                    .collect(),
            )
        } else {
            None
        };

        let question = content_service::update_question(
            &self.pool,
            payload.question_id,
            payload.text.as_deref(),
            payload.order,
            payload.hint.as_deref(),
            hint_provided,
            payload.image_base64.as_deref(),
            image_provided,
            answers.as_deref(),
        )
        .await?;
        Ok(Response::new(to_pb_question(&self.pool, &question).await?))
    }

    async fn delete_question(
        &self,
        request: Request<DeleteQuestionRequest>,
    ) -> Result<Response<DeleteQuestionResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_editor_or_admin(&user)?;
        let payload = request.into_inner();
        content_service::delete_question(&self.pool, payload.question_id).await?;
        Ok(Response::new(DeleteQuestionResponse {}))
    }
}
