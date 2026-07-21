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

      const assetResponse = await env.ASSETS.fetch(request);
      const headers = new Headers(assetResponse.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
