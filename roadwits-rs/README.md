# roadwits-rs

Rust-порт RoadWitsServer (изначально FastAPI + SQLAlchemy). Транспорт — только
gRPC (tonic/prost), без REST/gRPC-Gateway. orders/payments не переносились —
см. CHECKLIST.md.

## Структура

```
crates/
  roadwits-proto/     .proto-схемы + сгенерированный gRPC-код (lib).
                       Именно на этот крейт должен зависеть Rust-клиент —
                       он не тянет за собой БД/бизнес-логику.
  roadwits-server/     Реализация сервисов, бизнес-логика, БД.
    src/lib.rs           модули, переиспользуемые сервером и CLI
    src/main.rs          bin: сам gRPC-сервер
    src/bin/create_license.rs   bin: CLI для создания лицензии в обход gRPC
migrations/            SQL-миграции (sqlx migrate), одним файлом — 0001_init.sql
```

## Стек

tonic + prost (gRPC) · tokio · sqlx/postgres (compile-time проверяемые
запросы через `sqlx::query!`/`query_as!`) · tracing/tracing-subscriber ·
jsonwebtoken (JWT) · argon2 (объявлен, см. security/mod.rs — почему не
применяется к product_key).

## Запуск через Docker

```bash
cp .env.example .env
# при необходимости поменяй значения — все они пробрасываются в
# контейнеры через env_file в docker-compose.yml

docker compose up --build
```

Сервер сам накатывает миграции на пустую БД при старте. Health-check —
стандартный `grpc.health.v1` (см. `docker-compose.yml`, использует
`grpc_health_probe` внутри образа).

Первая лицензия — тем же способом, что и при локальном запуске (сеть не
подходит, `CreateLicense` сам требует admin-токен):

```bash
docker compose exec app ./create_license -- --user-type admin --email you@example.com --days 3650
```

## Запуск локально

Нужен Postgres. Дальше — как в любом sqlx-проекте:

```bash
export DATABASE_URL=postgres://user:pass@localhost/roadwits
export JWT_SECRET_KEY=<случайная строка, обязательно сменить в проде>
export GRPC_ADDR=0.0.0.0:50051   # по умолчанию

cargo run -p roadwits-server
```

При старте сервер сам накатывает миграции (`sqlx::migrate!`) на пустую БД.
Дальше — health-check (grpc.health.v1), либо напрямую вызовы через grpcurl:

```bash
grpcurl -plaintext -import-path crates/roadwits-proto/proto \
  -proto roadwits/v1/auth.proto \
  -d '{"product_key":"...","fingerprint":"device-1"}' \
  localhost:50051 roadwits.v1.AuthService/Login
```

### Создание первого админа

Через сеть это невозможно (CreateLicense сам требует admin-токен) — как и в
оригинале, первая лицензия создается напрямую в БД:

```bash
cargo run --bin create_license -- --user-type admin --email you@example.com --days 3650
```

### sqlx offline-режим (уже включен)

`.sqlx/` в корне репозитория — закоммиченный кэш проверенных запросов
(`cargo sqlx prepare --workspace`, уже сгенерирован и лежит в репозитории).
Поэтому `cargo build` **не требует** живого DATABASE_URL — CI и чистый чекаут
собираются офлайн:

```bash
export SQLX_OFFLINE=true
cargo build --workspace
```

Если меняете SQL-запросы — нужно перегенерировать кэш и закоммитить diff:

```bash
export DATABASE_URL=postgres://user:pass@localhost/roadwits
cargo sqlx prepare --workspace   # требует sqlx-cli: cargo install sqlx-cli --no-default-features --features postgres,rustls
```

## Переменные окружения

| Переменная          | Назначение                              | По умолчанию |
|----------------------|------------------------------------------|--------------|
| `DATABASE_URL`       | строка подключения к Postgres            | `postgres://roadwits:roadwits@db:5432/roadwits` |
| `JWT_SECRET_KEY`     | секрет для подписи JWT                   | `CHANGE_ME_IN_PRODUCTION` — **обязательно сменить** |
| `JWT_EXPIRE_MINUTES` | срок жизни токена, минут                 | `10080` (7 дней) |
| `GRPC_ADDR`          | адрес, на котором слушает gRPC-сервер    | `0.0.0.0:50051` |
| `APP_NAME`           | только для логов                         | `Roadwits` |
