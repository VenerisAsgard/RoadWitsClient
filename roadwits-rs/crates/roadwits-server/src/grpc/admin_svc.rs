use sqlx::PgPool;
use tonic::{Request, Response, Status};

use roadwits_proto::v1::admin_service_server::AdminService as AdminServiceTrait;
use roadwits_proto::v1::{
    BlockLicenseRequest, CreateLicenseRequest, DeleteLicenseRequest, DeleteLicenseResponse,
    ExtendLicenseRequest, GetLicenseRequest, License as PbLicense, ListLicensesRequest,
    ListLicensesResponse, ResetDeviceRequest, UnblockLicenseRequest,
};

use crate::auth_ctx;
use crate::config::Config;
use crate::db::models::UserRow;
use crate::error::AppError;
use crate::repo::user_repo;
use crate::service::{device_service, license_service};
use crate::util::pbstruct::{json_to_struct, struct_to_json};
use crate::util::safe_json::validate_safe_json;
use crate::util::time::to_timestamp;

pub struct AdminSvc {
    pub pool: PgPool,
    pub cfg: Config,
}

fn to_pb_license(row: &UserRow, device_count: i64) -> PbLicense {
    PbLicense {
        id: row.id,
        product_key: row.product_key.clone(),
        email: row.email.clone(),
        first_name: row.first_name.clone(),
        last_name: row.last_name.clone(),
        license_until: Some(to_timestamp(row.license_until)),
        user_type: row.user_type.as_str().to_string(),
        is_blocked: row.is_blocked,
        max_devices: row.max_devices,
        device_count: device_count as i32,
        settings: Some(json_to_struct(&row.settings.0)),
        payment_info: Some(json_to_struct(&row.payment_info.0)),
    }
}

async fn to_pb_license_full(pool: &PgPool, row: &UserRow) -> Result<PbLicense, AppError> {
    let count = user_repo::device_count(pool, row.id).await?;
    Ok(to_pb_license(row, count))
}

#[tonic::async_trait]
impl AdminServiceTrait for AdminSvc {
    async fn create_license(
        &self,
        request: Request<CreateLicenseRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();

        let user_type = crate::db::models::UserType::parse(&payload.user_type).ok_or_else(|| {
            AppError::InvalidArgument(
                "user_type должен быть одним из: admin, editor, student".to_string(),
            )
        })?;

        let payment_info = struct_to_json(&payload.payment_info.unwrap_or_default());
        validate_safe_json(&payment_info)?;

        let max_devices = payload.max_devices.clamp(1, device_service::MAX_DEVICES_LIMIT);

        let license = license_service::create_license(
            &self.pool,
            payload.license_days,
            payload.email.as_deref(),
            payload.first_name.as_deref(),
            payload.last_name.as_deref(),
            user_type,
            payment_info,
            max_devices,
        )
        .await?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn list_licenses(
        &self,
        request: Request<ListLicensesRequest>,
    ) -> Result<Response<ListLicensesResponse>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let licenses = license_service::list_licenses(&self.pool).await?;
        let mut out = Vec::with_capacity(licenses.len());
        for l in &licenses {
            out.push(to_pb_license_full(&self.pool, l).await?);
        }
        Ok(Response::new(ListLicensesResponse { licenses: out }))
    }

    async fn get_license(
        &self,
        request: Request<GetLicenseRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();
        let license = license_service::get_license(&self.pool, payload.user_id)
            .await?
            .ok_or(AppError::LicenseNotFound)?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn extend_license(
        &self,
        request: Request<ExtendLicenseRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();
        let license =
            license_service::extend_license(&self.pool, payload.user_id, payload.extra_days).await?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn block_license(
        &self,
        request: Request<BlockLicenseRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();
        let license = license_service::block_license(&self.pool, payload.user_id).await?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn unblock_license(
        &self,
        request: Request<UnblockLicenseRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();
        let license = license_service::unblock_license(&self.pool, payload.user_id).await?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn reset_device(
        &self,
        request: Request<ResetDeviceRequest>,
    ) -> Result<Response<PbLicense>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();
        let license = license_service::reset_device(&self.pool, payload.user_id).await?;
        Ok(Response::new(to_pb_license_full(&self.pool, &license).await?))
    }

    async fn delete_license(
        &self,
        request: Request<DeleteLicenseRequest>,
    ) -> Result<Response<DeleteLicenseResponse>, Status> {
        let admin = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        auth_ctx::require_admin(&admin)?;
        let payload = request.into_inner();

        if payload.user_id == admin.id {
            return Err(AppError::CannotDeleteSelf.into());
        }

        license_service::delete_license(&self.pool, payload.user_id).await?;
        Ok(Response::new(DeleteLicenseResponse {}))
    }
}
