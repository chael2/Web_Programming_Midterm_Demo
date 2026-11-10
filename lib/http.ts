// Shared request helpers for Route Handlers (no framework imports, so tests can load it).

/** Same-origin check used by every state-changing API (CSRF defense). */
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

/** Bodies larger than this are rejected before parsing. The largest legitimate body is a notice (≤ 5,100 chars). */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Reads a JSON object body with a size limit. Returns a ready-made error Response for
 * oversized (413) or malformed / non-object (400) bodies, so callers never parse unbounded input
 * and never answer a client mistake with a 5xx.
 */
export async function parseJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return { error: Response.json({ error: '요청 본문이 너무 큽니다.' }, { status: 413 }) };
  let text: string;
  try { text = await request.text(); } catch { return { error: Response.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 }) }; }
  if (new TextEncoder().encode(text).length > maxBytes) return { error: Response.json({ error: '요청 본문이 너무 큽니다.' }, { status: 413 }) };
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return { body: body as Record<string, unknown> };
  } catch { /* fall through */ }
  return { error: Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }) };
}
