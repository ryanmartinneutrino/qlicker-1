export function normalizeCertificatePem(certificate) {
  const trimmed = String(certificate || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('BEGIN CERTIFICATE')) {
    return trimmed;
  }

  const base64 = trimmed.replace(/\s+/g, '');
  const lines = base64.match(/.{1,64}/g) || [base64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}
