use sqlx::PgPool;
use tonic::{Request, Response, Status};

use roadwits_proto::v1::auth_service_server::AuthService;
use roadwits_proto::v1::{
    LoginRequest, LoginResponse, MeRequest, MeResponse, UpdateProfileRequest,
    UpdateSettingsRequest,
};

use crate::auth_ctx;
use crate::config::Config;
use crate::db::models::UserRow;
use crate::service::auth_service;
use crate::util::pbstruct::{json_to_struct, struct_to_json};
use crate::util::safe_json::validate_safe_json;
use crate::util::time::to_timestamp;

pub struct AuthSvc {
    pub pool: PgPool,
    pub cfg: Config,
}

fn to_me_response(user: &UserRow) -> MeResponse {
    MeResponse {
        id: user.id,
        product_key: user.product_key.clone(),
        email: user.email.clone(),
        first_name: user.first_name.clone(),
        last_name: user.last_name.clone(),
        license_until: Some(to_timestamp(user.license_until)),
        user_type: user.user_type.as_str().to_string(),
        is_blocked: user.is_blocked,
        settings: Some(json_to_struct(&user.settings.0)),
        profile_photo: user.profile_photo.clone(),
    }
}

#[tonic::async_trait]
impl AuthService for AuthSvc {
    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<LoginResponse>, Status> {
        let payload = request.into_inner();
        let token = auth_service::login(&self.pool, &self.cfg, &payload.product_key, &payload.fingerprint)
            .await
            .map_err(Status::from)?;
        Ok(Response::new(LoginResponse {
            access_token: token,
            token_type: "bearer".to_string(),
        }))
    }

    async fn me(&self, request: Request<MeRequest>) -> Result<Response<MeResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg)
            .await
            .map_err(Status::from)?;
        Ok(Response::new(to_me_response(&user)))
    }

    async fn update_settings(
        &self,
        request: Request<UpdateSettingsRequest>,
    ) -> Result<Response<MeResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg)
            .await
            .map_err(Status::from)?;
        let payload = request.into_inner();
        let settings_json = struct_to_json(&payload.settings.unwrap_or_default());
        validate_safe_json(&settings_json).map_err(Status::from)?;

        let updated = crate::repo::user_repo::update_settings(&self.pool, user.id, settings_json)
            .await
            .map_err(Status::from)?;
        Ok(Response::new(to_me_response(&updated)))
    }

    async fn update_profile(
        &self,
        request: Request<UpdateProfileRequest>,
    ) -> Result<Response<MeResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg)
            .await
            .map_err(Status::from)?;
        let payload = request.into_inner();

        // profile_photo: presence (proto3 optional) отличает "не трогать"
        // (None) от "заменить/очистить" (Some) — пустая строка трактуется
        // как явный сброс фото (аналог передачи null в JSON в оригинале).
        let photo_provided = payload.profile_photo.is_some();
        let profile_photo = payload.profile_photo.filter(|s| !s.is_empty());

        let updated = crate::repo::user_repo::update_profile(
            &self.pool,
            user.id,
            payload.first_name.as_deref(),
            payload.last_name.as_deref(),
            payload.email.as_deref(),
            profile_photo.as_deref(),
            photo_provided,
        )
        .await
        .map_err(Status::from)?;
        Ok(Response::new(to_me_response(&updated)))
    }
}
