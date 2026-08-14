/**
 * Друзья и лидерборд — перенесено из src-legacy/js/friends.js. Как и в
 * оригинале, доступно любому вошедшему (не только editor/admin) — сервер
 * сам решает, кто кому что может принять/удалить.
 */
import { state } from "./state.svelte.js";
import * as api from "./api/api.js";
import { toast, confirmDialog } from "./stores/ui.svelte.js";

/**
 * @typedef {Object} FriendRequestEntry
 * @property {number} id
 * @property {number} [user_id]
 * @property {string} [email]
 * @property {string} [first_name]
 * @property {string} [last_name]
 */

export const friends = $state({
  /** @type {FriendRequestEntry[]} */
  incoming: [],
  /** @type {FriendRequestEntry[]} */
  outgoing: [],
  /** @type {FriendRequestEntry[]} */
  accepted: [],
  loaded: false,
});
/** @type {{status: "idle"|"loading"|"ready"|"error", entries: any[], error: string}} */
export const leaderboard = $state({ status: "idle", entries: [], error: "" }); // idle|loading|ready|error

export async function loadFriends() {
  try {
    const [incoming, outgoing, accepted] = await Promise.all([
      api.listIncomingFriendRequests(state.token),
      api.listOutgoingFriendRequests(state.token),
      api.listFriends(state.token),
    ]);
    friends.incoming = incoming;
    friends.outgoing = outgoing;
    friends.accepted = accepted;
    friends.loaded = true;
  } catch {
    // панель друзей не критична для остального приложения — тихо пропускаем
  }
}

export async function loadLeaderboard() {
  leaderboard.status = "loading";
  try {
    leaderboard.entries = await api.getLeaderboard(state.token);
    leaderboard.status = "ready";
  } catch (err) {
    leaderboard.error = err instanceof api.ApiError ? err.message : "Не удалось загрузить лидерборд";
    leaderboard.status = "error";
  }
}

export function friendPartner(friendship) {
  const myId = state.user?.id;
  return friendship.requester.id === myId ? friendship.addressee : friendship.requester;
}

export function friendLabel(person) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return name || person.email || `#${person.id}`;
}

export async function sendFriendRequestByEmail(email) {
  try {
    await api.sendFriendRequest(state.token, email);
    toast("Заявка отправлена", "success");
    await loadFriends();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось отправить заявку", "error");
    return false;
  }
}

export async function acceptFriendRequestById(friendshipId) {
  try {
    await api.acceptFriendRequest(state.token, friendshipId);
    toast("Заявка принята", "success");
    await loadFriends();
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось принять заявку", "error");
  }
}

export async function removeFriendshipById(friendshipId, { confirm = false } = {}) {
  if (confirm) {
    const ok = await confirmDialog({
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
    toast(err instanceof api.ApiError ? err.message : "Не удалось выполнить действие", "error");
  }
}
