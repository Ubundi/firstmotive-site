function isInternalDeckPath(pathname) {
  return pathname === '/internal-decks' || pathname.startsWith('/internal-decks/');
}

function fixedTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function hasValidPassword(request, expectedPassword) {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return false;

  try {
    const credentials = atob(header.slice(6));
    const separator = credentials.indexOf(':');
    const password = separator >= 0 ? credentials.slice(separator + 1) : '';
    return fixedTimeEqual(password, expectedPassword);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isInternalDeckPath(url.pathname)) {
      if (!hasValidPassword(request, env.INTERNAL_DECKS_PASSWORD ?? '')) {
        return new Response('Authentication required.', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="First Motive internal decks", charset="UTF-8"',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
          },
        });
      }

      // Static Assets treats Authorization specially. Authentication has already
      // been checked above, so remove it before delegating to the asset service.
      const assetRequest = new Request(request);
      assetRequest.headers.delete('Authorization');
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      const response = new Response(assetResponse.body, assetResponse);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

      return response;
    }

    return env.ASSETS.fetch(request);
  },
};
