/**
 * Проверка связи с сервером (GET /health) — обновляет
 * state.connectionStatus/connectionDetail, которые читает StatusBar.svelte.
 *
 * Раньше это была локальная функция прямо внутри onMount в +page.svelte:
 * дергалась один раз при старте и затем по таймеру (HEALTHCHECK_POLL_MS).
 * Вынесена в отдельный модуль, чтобы её же можно было дёрнуть вручную — по
 * клику на статус "Сервер онлайн" в StatusBar (принудительная проверка,
 * по просьбе), не дожидаясь следующего тика фонового опроса.
 */
import { state } from "./state.svelte.js";
import * as api from "./api/api.js";

let checking = false;

/**
 * @param {{manual?: boolean}} [opts] manual=true — ручной запуск (клик по
 * статусу): статус на время проверки становится "checking…", чтобы дать
 * видимую обратную связь на нажатие. Фоновый опрос по таймеру запускает
 * без этого — иначе индикатор молчал бы "проверка…" каждые пару минут сам
 * по себе, чего раньше не было и что выглядело бы как лишнее мигание.
 */
export async function checkConnection({ manual = false } = {}) {
  if (checking) return; // не дублируем проверку поверх уже идущей (двойной клик/клик поверх фонового опроса)
  checking = true;
  if (manual) state.connectionStatus = "checking";
  try {
    const data = await api.health();
    state.connectionStatus = data?.status === "ok" ? "ok" : "degraded";
    state.connectionDetail = data?.status || "статус сервера не ok";
  } catch {
    state.connectionStatus = "offline";
    state.connectionDetail = "Проблемы с подключением или сервером";
  } finally {
    checking = false;
  }
}
