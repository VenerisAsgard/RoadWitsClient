/**
 * Друзья (панель в профиле). В отличие от лицензий, здесь нет разделения
 * по ролям — доступно любому вошедшему пользователю. Сервер сам решает,
 * кто кому что может принять/удалить (см. friendship_service.py).
 */
import { state } from "./state.js";
import * as api from "./api.js";
import * as render from "./render.js";

export async function loadFriends() {
  try {
    const [incoming, outgoing, accepted] = await Promise.all([
      api.listIncomingFriendRequests(state.token),
      api.listOutgoingFriendRequests(state.token),
      api.listFriends(state.token),
    ]);
    render.renderFriends({ incoming, outgoing, accepted });
  } catch {
    // панель друзей не критична для остального приложения — тихо пропускаем
  }
}

/** Открывает модалку лидерборда сразу с индикатором загрузки, потом
 * подменяет её содержимое на список — так модалка не "пустая" те
 * несколько сотен мс, пока идёт запрос. */
export async function loadLeaderboard() {
  render.renderLeaderboardLoading();
  try {
    const entries = await api.getLeaderboard(state.token);
    render.renderLeaderboard(entries);
  } catch (err) {
    render.renderLeaderboardError(err instanceof api.ApiError ? err.message : "Не удалось загрузить лидерборд");
  }
}

export async function sendFriendRequestByEmail(email) {
  try {
    await api.sendFriendRequest(state.token, email);
    render.toast("Заявка отправлена", "success");
    await loadFriends();
    return true;
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось отправить заявку", "error");
    return false;
  }
}

export async function acceptFriendRequestById(friendshipId) {
  try {
    await api.acceptFriendRequest(state.token, friendshipId);
    render.toast("Заявка принята", "success");
    await loadFriends();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось принять заявку", "error");
  }
}

/** Используется и для отклонения входящей заявки, и для отзыва исходящей,
 * и для удаления уже принятой дружбы — с точки зрения сервера это одно
 * и то же действие (см. friendship_service.remove). */
export async function removeFriendshipById(friendshipId, { confirm = false } = {}) {
  if (confirm) {
    const ok = await render.confirmDialog({
      title: "Удалить из друзей?",
      text: "Дружбу можно будет восстановить только новой заявкой.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      danger: true,
    });
    if (!ok) return;
  }
  try {
    await api.removeFriendship(state.token, friendshipId);
    await loadFriends();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось выполнить действие", "error");
  }
}
