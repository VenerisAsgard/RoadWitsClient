//! Всё общение с новым сервером (roadwits-rs, gRPC) — в этом модуле и только
//! в нём, по тому же принципу, по которому раньше было устроено
//! `src/lib/api/api.js` на фронтенде: остальной Rust-код (main.rs, session-
//! хэндлы) про gRPC/proto ничего не знает, а фронтенд теперь тоже ничего не
//! знает про транспорт — он просто вызывает `invoke("login", …)` и получает
//! обратно тот же JSON, что раньше отдавал REST (см. commands.rs и
//! src/lib/api/api.js на фронтенде).

pub mod commands;
pub mod convert;
pub mod error;

/// Сгенерированный из .proto код (см. build.rs). Пакет один и тот же
/// (`roadwits.v1`) для всех четырёх .proto-файлов, поэтому один
/// `include_proto!` даёт доступ и к сообщениям, и к клиентам всех четырёх
/// сервисов (auth_service_client, content_service_client,
/// admin_service_client, friends_service_client).
pub mod pb {
    pub mod v1 {
        tonic::include_proto!("roadwits.v1");
    }
}

/// Адрес нового gRPC-сервера. Единственное место, которое нужно менять под
/// другой backend (аналог SERVER_BASE_URL в старом src/lib/config.js) —
/// теперь оно здесь, а не на фронтенде, раз всё общение с сервером переехало
/// в Rust.
const SERVER_ADDR: &str = "http://leased-line-gomel-91-149-169-88.telecom.by:50051";

/// Канал к серверу, управляемый Tauri (`app.manage(...)`) — общий на всё
/// приложение. Само TCP/HTTP2-соединение (`connect_lazy`) намеренно НЕ
/// создаётся здесь же при регистрации состояния: `connect_lazy` внутри себя
/// спавнит фоновую tokio-задачу (keep-alive/таймер), а `.manage(...)`
/// вызывается в цепочке `tauri::Builder` ДО того, как поднимется рантайм
/// Tauri — там ещё нет "активного" tokio-рантайма, и попытка сделать это
/// сразу падает с паникой "there is no reactor running". Поэтому канал
/// создаётся лениво, при первом реальном вызове изнутри async-команды (там
/// рантайм уже гарантированно есть) и кэшируется в `OnceCell` — все
/// последующие вызовы просто клонируют уже готовый `Channel` (это дёшево,
/// как Arc).
pub struct GrpcChannel {
    endpoint: tonic::transport::Endpoint,
    channel: tokio::sync::OnceCell<tonic::transport::Channel>,
}

impl GrpcChannel {
    pub fn new() -> Self {
        let endpoint = tonic::transport::Endpoint::from_static(SERVER_ADDR)
            // Разумный верхний таймаут на один вызов (аналог
            // REQUEST_TIMEOUT_MS/QUESTIONS_FETCH_TIMEOUT_MS в старом
            // src/lib/config.js) — конкретные вызовы, которым нужно больше
            // (см. list_questions/update_profile в commands.rs), выставляют
            // свой таймаут через `tonic::Request::set_timeout` поверх этого.
            .timeout(std::time::Duration::from_secs(20));
        Self { endpoint, channel: tokio::sync::OnceCell::new() }
    }

    /// Отдаёт уже подключенный (или ленивый — см. выше) канал, создавая его
    /// при первом вызове. Вызывать можно только из async-контекста,
    /// запущенного на tokio-рантайме (то есть изнутри `#[tauri::command]
    /// async fn`) — именно поэтому все команды в commands.rs вызывают
    /// `channel.channel().await`, а не трогают `GrpcChannel` синхронно.
    pub async fn channel(&self) -> tonic::transport::Channel {
        self.channel
            .get_or_init(|| async { self.endpoint.clone().connect_lazy() })
            .await
            .clone()
    }
}
