const USER_KEY = 'media-rental.user';

export class ApiError extends Error {
  constructor(status, message, payload) {
    super(message);
    this.status = status;
    this.code = payload?.code ?? 'error';
    this.details = payload?.details ?? null;
  }
}

export const getUserId = () => localStorage.getItem(USER_KEY);
export const setUserId = (id) => localStorage.setItem(USER_KEY, String(id));
export const clearUserId = () => localStorage.removeItem(USER_KEY);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const userId = getUserId();
  if (userId) headers['X-User-Id'] = userId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Сервер недоступен. Проверьте, что приложение запущено.');
  }
  const elapsed = performance.now() - startedAt;
  window.dispatchEvent(new CustomEvent('api:timing', { detail: { path, method, elapsed, status: response.status } }));

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('session:expired'));
    throw new ApiError(response.status, payload.error?.message ?? 'Ошибка запроса', payload.error);
  }
  return payload;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
