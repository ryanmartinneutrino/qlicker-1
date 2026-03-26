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

/**
 * Returns true if `hostname` resolves to a private, loopback, or link-local
 * address that should never be reached by server-side fetches (SSRF protection).
 */
export function isPrivateHostname(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  // Loopback
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]') return true;
  // Cloud metadata endpoints
  if (lower === '169.254.169.254' || lower === 'metadata.google.internal') return true;
  // Common internal hostnames
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  // IPv4 private ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local)
    if (a === 0) return true;                            // 0.0.0.0/8
  }
  return false;
}
