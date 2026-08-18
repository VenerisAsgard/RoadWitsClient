// Общий цвет для аватара-заглушки (нет profile_photo) — генерируется по
// user_id, а не фиксированный акцент. Раньше был единый var(--amber) для
// всех пользователей (ProfileScreen.svelte/Titlebar.svelte) — по заявке
// перевели на тот же принцип, что уже был в лидерборде (FriendsModal.svelte):
// стабильный hue по id, чтобы у разных людей аватары были разного цвета
// (и один и тот же человек всегда получал один и тот же цвет).
export function avatarColorStyle(id) {
  const hue = ((Number(id) || 0) * 47) % 360;
  return `background: hsl(${hue}, 55%, 40%)`;
}
