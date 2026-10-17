const SAVED_MATCHES_PREFIX = 'cricpulse_saved_matches:';

function userKey(user) {
  return user?.localAccountKey || user?.id || user?.userId || user?.email || user?.username || user?.phoneNumber || 'account';
}

function matchesKey(user) {
  return `${SAVED_MATCHES_PREFIX}${encodeURIComponent(userKey(user))}`;
}

export function saveUserMatch(user, match) {
  if (!user || !match?.id) return;
  try {
    const saved = JSON.parse(window.localStorage.getItem(matchesKey(user)) || '[]');
    const updated = [match, ...saved.filter((item) => String(item.id) !== String(match.id))];
    window.localStorage.setItem(matchesKey(user), JSON.stringify(updated));
  } catch {
    window.localStorage.setItem(matchesKey(user), JSON.stringify([match]));
  }
}

export function getUserMatches(user) {
  if (!user) return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(matchesKey(user)) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
