use tonic::{Code, Status};

/// Единая ошибка домена. Соответствует трем иерархиям исключений оригинала
/// (AuthError/ContentError/FriendshipError, см. app/services/exceptions.py),
/// собранным в одно место, потому что в gRPC нет отдельных "типов ошибок
/// роутера" — на границе всё равно превращается в tonic::Status.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Product key не найден")]
    InvalidProductKey,

    #[error("Срок действия лицензии истёк")]
    LicenseExpired,

    #[error("Лицензия заблокирована администратором")]
    LicenseBlocked,

    #[error("Лицензия уже привязана к максимальному числу устройств ({0}). Обратитесь к администратору, чтобы сбросить привязку.")]
    DeviceLimitReached(i32),

    #[error("Невалидный или истёкший токен")]
    InvalidToken,

    #[error("Доступно только администратору")]
    AdminOnly,

    #[error("Доступно только редактору или администратору")]
    EditorOrAdminOnly,

    #[error("Редактор не может изменять порядок главы")]
    EditorCannotReorder,

    #[error("Нельзя удалить свою же учетную запись")]
    CannotDeleteSelf,

    #[error("{0}")]
    Content(String),

    #[error("{0}")]
    Friendship(String),

    #[error("Глава не найдена")]
    ChapterNotFound,

    #[error("Задание не найдено")]
    QuestionNotFound,

    #[error("Лицензия не найдена")]
    LicenseNotFound,

    #[error("Заявка не найдена")]
    FriendshipNotFound,

    #[error("Это не ваша заявка/дружба")]
    NotYourFriendship,

    #[error("Принять заявку может только её адресат")]
    NotAddressee,

    #[error("база данных: {0}")]
    Database(#[from] sqlx::Error),

    #[error("неверный аргумент: {0}")]
    InvalidArgument(String),
}

impl From<AppError> for Status {
    fn from(err: AppError) -> Self {
        use AppError::*;
        let code = match &err {
            InvalidProductKey | InvalidToken => Code::Unauthenticated,
            LicenseExpired
            | LicenseBlocked
            | DeviceLimitReached(_)
            | AdminOnly
            | EditorOrAdminOnly
            | EditorCannotReorder
            | CannotDeleteSelf
            | NotYourFriendship
            | NotAddressee => Code::PermissionDenied,
            ChapterNotFound | QuestionNotFound | LicenseNotFound | FriendshipNotFound => {
                Code::NotFound
            }
            Content(_) | InvalidArgument(_) => Code::InvalidArgument,
            Friendship(_) => Code::FailedPrecondition,
            Database(_) => Code::Internal,
        };
        Status::new(code, err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
