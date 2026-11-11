import { corsHeaders as supabaseCorsHeaders } from 'supabase/cors';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function corsHeaders(request: Request) {
  const requestOrigin = request.headers.get('origin');
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigin =
    requestOrigin && configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0] ?? '*';

  return {
    ...supabaseCorsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
}

export function optionsResponse(request: Request) {
  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders(request) });
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export function errorResponse(request: Request, failure: unknown) {
  const error = failure instanceof HttpError ? failure : new HttpError(500, 'An unexpected error occurred.', 'internal_error');
  if (!(failure instanceof HttpError)) console.error(failure);
  return jsonResponse(request, { error: error.message, code: error.code }, error.status);
}

export async function readJson(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 16_384) throw new HttpError(413, 'Request body is too large.', 'payload_too_large');

  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Send a valid JSON request body.', 'invalid_json');
  }
}
