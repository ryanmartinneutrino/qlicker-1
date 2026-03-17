export function isSafeProfileImageUrl(value) {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('//')) {
    return false;
  }

  if (trimmed.startsWith('/')) {
    if (/^\/{2,}/.test(trimmed)) {
      return false;
    }
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
