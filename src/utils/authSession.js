export const AUTH_USER_KEY = 'cricpulse_user';

export function unwrapUser(response) {
  return response?.user || response?.data?.user || response?.data || response;
}

export function withLocalAccountKey(user) {
  if (!user || typeof user !== 'object') return user;
  const identity = user.id || user.userId || user.email || user.username || user.phoneNumber;
  const localAccountKey = user.localAccountKey
    || identity
    || globalThis.crypto?.randomUUID?.()
    || `account-${Date.now()}`;
  return { ...user, localAccountKey };
}
