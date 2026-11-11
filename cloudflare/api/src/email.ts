export type TransactionalEmail = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

type EmailEnvironment = {
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
};

export async function sendTransactionalEmail(env: EmailEnvironment, message: TransactionalEmail) {
  if (!env.RESEND_API_KEY) {
    return { ok: false as const, code: 'email_unconfigured' as const };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });

  if (!response.ok) {
    return { ok: false as const, code: 'email_delivery_failed' as const };
  }

  const result = await response.json() as { id: string };
  return { ok: true as const, id: result.id };
}
