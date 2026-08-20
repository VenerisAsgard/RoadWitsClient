# syntax=docker/dockerfile:1

# --- сборка ---
# Собираем в offline sqlx-режиме — .sqlx/ закоммичен в репозиторий, поэтому
# на этом этапе не нужен живой Postgres (см. README.md, "sqlx offline-режим").
FROM rust:1-slim-bookworm AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        protobuf-compiler \
        libprotobuf-dev \
        pkg-config \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY migrations migrations
COPY .sqlx .sqlx

ENV SQLX_OFFLINE=true
RUN cargo build --release --workspace

# --- запуск ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 wget \
    && rm -rf /var/lib/apt/lists/*

# grpc_health_probe — сервер отдает стандартный grpc.health.v1 (см. README),
# но у него нет HTTP-эндпоинта для healthcheck, а `docker compose` не умеет
# HTTP/2-пробы из коробки. Эта утилита — маленький статический бинарник,
# который просто дергает Health/Check и возвращает код возврата.
ARG GRPC_HEALTH_PROBE_VERSION=v0.4.24
RUN wget -qO/bin/grpc_health_probe \
        https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 \
    && chmod +x /bin/grpc_health_probe \
    && apt-get purge -y wget && apt-get autoremove -y

WORKDIR /app

COPY --from=builder /build/target/release/roadwits-server ./roadwits-server
COPY --from=builder /build/target/release/create_license ./create_license
COPY migrations migrations

# Миграции сервер накатывает сам при старте (sqlx::migrate! на пустую БД) —
# см. README.md. create_license остаётся в образе как CLI для выдачи первой
# админской лицензии: docker compose exec app ./create_license -- ...

EXPOSE 50051

CMD ["./roadwits-server"]
