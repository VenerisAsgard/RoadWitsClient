use sqlx::PgPool;
use tonic::{Request, Response, Status};

use roadwits_proto::v1::friends_service_server::FriendsService as FriendsServiceTrait;
use roadwits_proto::v1::{
    AcceptFriendRequestRequest, FriendUser, Friendship as PbFriendship, FriendshipList,
    LeaderboardEntry as PbLeaderboardEntry, LeaderboardRequest, LeaderboardResponse,
    ListFriendsRequest, ListIncomingRequest, ListOutgoingRequest, RemoveFriendshipRequest,
    RemoveFriendshipResponse, SendFriendRequestRequest,
};

use crate::auth_ctx;
use crate::config::Config;
use crate::db::models::{FriendshipRow, UserRow};
use crate::error::AppError;
use crate::repo::user_repo;
use crate::service::friendship_service;
use crate::util::time::to_timestamp;

pub struct FriendsSvc {
    pub pool: PgPool,
    pub cfg: Config,
}

fn to_friend_user(row: &UserRow) -> FriendUser {
    FriendUser {
        id: row.id,
        email: row.email.clone(),
        first_name: row.first_name.clone(),
        last_name: row.last_name.clone(),
    }
}

async fn to_pb_friendship(pool: &PgPool, row: &FriendshipRow) -> Result<PbFriendship, AppError> {
    let requester = user_repo::get_by_id(pool, row.requester_id)
        .await?
        .expect("requester exists (FK)");
    let addressee = user_repo::get_by_id(pool, row.addressee_id)
        .await?
        .expect("addressee exists (FK)");
    Ok(PbFriendship {
        id: row.id,
        status: row.status.as_str().to_string(),
        created_at: Some(to_timestamp(row.created_at)),
        responded_at: row.responded_at.map(to_timestamp),
        requester: Some(to_friend_user(&requester)),
        addressee: Some(to_friend_user(&addressee)),
    })
}

async fn to_pb_list(pool: &PgPool, rows: &[FriendshipRow]) -> Result<FriendshipList, AppError> {
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(to_pb_friendship(pool, r).await?);
    }
    Ok(FriendshipList { friendships: out })
}

#[tonic::async_trait]
impl FriendsServiceTrait for FriendsSvc {
    async fn send_request(
        &self,
        request: Request<SendFriendRequestRequest>,
    ) -> Result<Response<PbFriendship>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let payload = request.into_inner();
        let friendship = friendship_service::send_request(&self.pool, &user, &payload.email).await?;
        Ok(Response::new(to_pb_friendship(&self.pool, &friendship).await?))
    }

    async fn list_incoming(
        &self,
        request: Request<ListIncomingRequest>,
    ) -> Result<Response<FriendshipList>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let rows = friendship_service::list_incoming(&self.pool, user.id).await?;
        Ok(Response::new(to_pb_list(&self.pool, &rows).await?))
    }

    async fn list_outgoing(
        &self,
        request: Request<ListOutgoingRequest>,
    ) -> Result<Response<FriendshipList>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let rows = friendship_service::list_outgoing(&self.pool, user.id).await?;
        Ok(Response::new(to_pb_list(&self.pool, &rows).await?))
    }

    async fn accept(
        &self,
        request: Request<AcceptFriendRequestRequest>,
    ) -> Result<Response<PbFriendship>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let payload = request.into_inner();
        let friendship =
            friendship_service::accept_request(&self.pool, user.id, payload.friendship_id).await?;
        Ok(Response::new(to_pb_friendship(&self.pool, &friendship).await?))
    }

    async fn remove(
        &self,
        request: Request<RemoveFriendshipRequest>,
    ) -> Result<Response<RemoveFriendshipResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let payload = request.into_inner();
        friendship_service::remove(&self.pool, user.id, payload.friendship_id).await?;
        Ok(Response::new(RemoveFriendshipResponse {}))
    }

    async fn list_friends(
        &self,
        request: Request<ListFriendsRequest>,
    ) -> Result<Response<FriendshipList>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let rows = friendship_service::list_friends(&self.pool, user.id).await?;
        Ok(Response::new(to_pb_list(&self.pool, &rows).await?))
    }

    async fn leaderboard(
        &self,
        request: Request<LeaderboardRequest>,
    ) -> Result<Response<LeaderboardResponse>, Status> {
        let user = auth_ctx::current_user(&request, &self.pool, &self.cfg).await?;
        let entries = friendship_service::leaderboard(&self.pool, &user).await?;
        Ok(Response::new(LeaderboardResponse {
            entries: entries
                .into_iter()
                .map(|e| PbLeaderboardEntry {
                    user_id: e.user_id,
                    first_name: e.first_name,
                    last_name: e.last_name,
                    email: e.email,
                    profile_photo: e.profile_photo,
                    points: e.points as i32,
                    is_me: e.is_me,
                })
                .collect(),
        }))
    }
}
