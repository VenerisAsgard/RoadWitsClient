-- Схема Roadwits. Портирована из SQLAlchemy-моделей исходного Python-сервера
-- (app/models/*.py), состояние "после всех alembic-миграций", включая
-- f2b7d1e4a5c6_drop_orders_payments_removed (orders/payments в новом сервере
-- не реализуются вовсе — см. checklist).
--
-- test_results (app/models/result.py) сохранена для совместимости схемы,
-- но ни один сервис/gRPC-метод её не использует — в оригинале она тоже
-- была "мертвым" кодом (модель существовала, но ни один роутер её не
-- вызывал). Если результаты тестов понадобятся, add methods here.

CREATE TYPE user_type AS ENUM ('admin', 'editor', 'student');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    product_key     VARCHAR(40) NOT NULL UNIQUE,
    email           VARCHAR(255),
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    license_until   TIMESTAMPTZ NOT NULL,
    user_type       user_type NOT NULL DEFAULT 'student',
    is_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
    profile_photo   TEXT,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    payment_info    JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_devices     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX ix_users_product_key ON users (product_key);

CREATE TABLE devices (
    id              BIGSERIAL PRIMARY KEY,
    fingerprint     VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen       TIMESTAMPTZ
);

CREATE INDEX ix_devices_fingerprint ON devices (fingerprint);

-- Многие-ко-многим: одно устройство может быть общим для нескольких
-- лицензий, одна лицензия может быть привязана до max_devices устройств.
CREATE TABLE user_devices (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id   BIGINT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_id)
);

CREATE TABLE chapters (
    id              BIGSERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    "order"         INTEGER NOT NULL DEFAULT 0,
    created_by_id   BIGINT REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE questions (
    id              BIGSERIAL PRIMARY KEY,
    chapter_id      BIGINT NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    "order"         INTEGER NOT NULL DEFAULT 0,
    hint            TEXT,
    image_base64    TEXT,
    created_by_id   BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_questions_chapter_id ON questions (chapter_id);

CREATE TABLE answers (
    id              BIGSERIAL PRIMARY KEY,
    question_id     BIGINT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_answers_question_id ON answers (question_id);

CREATE TABLE friendships (
    id              BIGSERIAL PRIMARY KEY,
    requester_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    addressee_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status          friendship_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at    TIMESTAMPTZ,
    UNIQUE (requester_id, addressee_id)
);

CREATE INDEX ix_friendships_requester_id ON friendships (requester_id);
CREATE INDEX ix_friendships_addressee_id ON friendships (addressee_id);

-- Существует в схеме (см. комментарий вверху файла), но не задействована
-- ни одним gRPC-методом на момент переноса.
CREATE TABLE test_results (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    chapter_id      BIGINT NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
    score           INTEGER NOT NULL,
    total           INTEGER NOT NULL,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
