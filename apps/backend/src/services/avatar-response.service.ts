import { normalizeAvatarUrl } from './avatar-url.service';

function normalizeAvatarFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeAvatarFields);
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      key === 'avatarUrl' && (typeof fieldValue === 'string' || fieldValue === null)
        ? normalizeAvatarUrl(fieldValue)
        : normalizeAvatarFields(fieldValue),
    ]),
  );
}

export function normalizeAvatarUrlsInResponse(payload: unknown) {
  return normalizeAvatarFields(payload);
}
