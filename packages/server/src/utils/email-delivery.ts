import { spawn } from 'child_process'

interface VerificationEmailInput {
  to: string
  verifyUrl: string
  from?: string
}

function smtpToCurlUrl(mailUrl: URL): string {
  const host = mailUrl.hostname
  const port = mailUrl.port || (mailUrl.protocol === 'smtps:' ? '465' : '587')
  return `smtp://${host}:${port}`
}

function sendWithCurl(mailUrl: URL, message: string, to: string, from: string): Promise<boolean> {
  return new Promise((resolve) => {
    const curlArgs = [
      '--silent',
      '--show-error',
      '--url',
      smtpToCurlUrl(mailUrl),
      '--mail-from',
      from,
      '--mail-rcpt',
      to,
      '--upload-file',
      '-',
    ]

    const username = decodeURIComponent(mailUrl.username || '')
    const password = decodeURIComponent(mailUrl.password || '')
    if (username) {
      curlArgs.push('--user', `${username}:${password}`)
    }
    if (mailUrl.protocol === 'smtps:' || mailUrl.searchParams.get('secure') === 'true') {
      curlArgs.push('--ssl-reqd')
    }

    const child = spawn('curl', curlArgs, { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true)
        return
      }
      if (stderr.trim()) {
        console.warn(`Verification email delivery failed: ${stderr.trim()}`)
      }
      resolve(false)
    })
    child.stdin.write(message)
    child.stdin.end()
  })
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<boolean> {
  const mailUrlRaw = process.env.MAIL_URL
  const from = input.from || process.env.EMAIL_FROM || 'no-reply@qlicker.local'
  const messageBody = [
    `From: ${from}`,
    `To: ${input.to}`,
    'Subject: Verify your Qlicker email',
    '',
    'Please verify your email address by opening this link:',
    input.verifyUrl,
    '',
    'If you did not request this email, you can ignore it.',
    '',
  ].join('\n')

  if (!mailUrlRaw) {
    console.info(`MAIL_URL not configured. Verification URL for ${input.to}: ${input.verifyUrl}`)
    return false
  }

  try {
    const parsed = new URL(mailUrlRaw)
    if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
      console.warn(`Unsupported MAIL_URL protocol: ${parsed.protocol}`)
      console.info(`Verification URL for ${input.to}: ${input.verifyUrl}`)
      return false
    }
    const delivered = await sendWithCurl(parsed, messageBody, input.to, from)
    if (!delivered) {
      console.info(`Verification URL for ${input.to}: ${input.verifyUrl}`)
    }
    return delivered
  } catch {
    console.info(`Invalid MAIL_URL; verification URL for ${input.to}: ${input.verifyUrl}`)
    return false
  }
}
