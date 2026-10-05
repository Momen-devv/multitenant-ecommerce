import type { Response } from 'express';

export async function sendAuthResponse(
  response: Response,
  result: globalThis.Response,
) {
  response.status(result.status);
  result.headers.forEach((value, name) => {
    if (
      ![
        'set-cookie',
        'content-length',
        'transfer-encoding',
        'connection',
      ].includes(name)
    )
      response.setHeader(name, value);
  });
  const cookies = result.headers.getSetCookie();
  if (cookies.length) response.append('Set-Cookie', cookies);
  response.setHeader('Cache-Control', 'no-store');
  response.send(Buffer.from(await result.arrayBuffer()));
}
