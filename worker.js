import { unzipSync } from 'fflate';

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 250;

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

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
}

function badRequest(message) {
  return responseJson({ error: message }, 400);
}

function cleanField(value, maxLength) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function contentTypeForPath(path) {
  const extension = path.split('.').pop()?.toLowerCase();
  return {
    html: 'text/html; charset=UTF-8',
    htm: 'text/html; charset=UTF-8',
    css: 'text/css; charset=UTF-8',
    js: 'text/javascript; charset=UTF-8',
    mjs: 'text/javascript; charset=UTF-8',
    json: 'application/json; charset=UTF-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    woff: 'font/woff',
    woff2: 'font/woff2',
    pdf: 'application/pdf',
  }[extension] ?? 'application/octet-stream';
}

function safeZipPath(rawPath) {
  const path = rawPath.replaceAll('\\', '/');
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
    return null;
  }
  if (segments[0] === '__MACOSX' || segments.some((segment) => segment === '.DS_Store')) return null;
  return segments.join('/');
}

function stripCommonRoot(files) {
  const firstSegments = files.map(({ path }) => path.split('/')[0]);
  if (!firstSegments.length || !firstSegments.every((segment) => segment === firstSegments[0])) return files;
  if (!files.every(({ path }) => path.includes('/'))) return files;
  const root = `${firstSegments[0]}/`;
  return files.map(({ path, bytes }) => ({ path: path.slice(root.length), bytes }));
}

function authRequired() {
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="First Motive internal decks", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function uploadOriginIsAllowed(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function listUploadedDecks(env) {
  const prefixes = [];
  let cursor;

  do {
    const page = await env.DECKS.list({ prefix: 'decks/', delimiter: '/', ...(cursor ? { cursor } : {}) });
    prefixes.push(...(page.delimitedPrefixes ?? []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const decks = await Promise.all(prefixes.map(async (prefix) => {
    const object = await env.DECKS.get(`${prefix}meta.json`);
    if (!object) return null;
    try {
      return JSON.parse(await object.text());
    } catch {
      return null;
    }
  }));

  return decks.filter(Boolean).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function uploadDeck(request, env) {
  if (!env.DECKS) return responseJson({ error: 'Deck storage is not configured.' }, 503);
  if (!uploadOriginIsAllowed(request)) return responseJson({ error: 'Upload origin is not allowed.' }, 403);

  const form = await request.formData();
  const title = cleanField(form.get('title'), 120);
  const team = cleanField(form.get('team'), 120);
  const date = cleanField(form.get('date'), 10);
  const file = form.get('package');

  if (!title || !team || !isValidDate(date)) return badRequest('Enter a title, team, and valid deck date.');
  if (!file || typeof file.arrayBuffer !== 'function') return badRequest('Choose a ZIP package to upload.');
  if (file.size > MAX_ZIP_BYTES) return badRequest('ZIP packages must be 50 MB or smaller.');
  if (!String(file.name ?? '').toLowerCase().endsWith('.zip')) return badRequest('Upload a .zip package.');

  let archive;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return badRequest('The ZIP package could not be read.');
  }

  let files = Object.entries(archive)
    .filter(([rawPath]) => !rawPath.endsWith('/'))
    .map(([rawPath, bytes]) => ({ path: safeZipPath(rawPath), bytes }))
    .filter(({ path }) => path);
  files = stripCommonRoot(files);

  if (!files.length) return badRequest('The ZIP package is empty.');
  if (files.length > MAX_FILES) return badRequest(`ZIP packages may contain at most ${MAX_FILES} files.`);

  const paths = new Set();
  let unpackedBytes = 0;
  for (const fileEntry of files) {
    if (!fileEntry.path || paths.has(fileEntry.path)) return badRequest('The ZIP package contains duplicate or unsafe paths.');
    paths.add(fileEntry.path);
    unpackedBytes += fileEntry.bytes.byteLength;
    if (unpackedBytes > MAX_UNPACKED_BYTES) return badRequest('The unpacked package is too large.');
  }

  const htmlFiles = files.filter(({ path }) => /\.html?$/.test(path.toLowerCase()));
  const entry = files.find(({ path }) => path.toLowerCase() === 'index.html')
    ?? files.find(({ path }) => path.toLowerCase() === 'index.htm')
    ?? (htmlFiles.length === 1 ? htmlFiles[0] : null);
  if (!entry) return badRequest('Include index.html or exactly one HTML entrypoint in the ZIP package.');

  const id = crypto.randomUUID();
  const prefix = `decks/${id}/`;
  const storedKeys = [];
  const metadata = {
    id,
    title,
    team,
    date,
    entry: entry.path,
    originalFilename: cleanField(file.name, 160),
    createdAt: new Date().toISOString(),
    href: `/internal-decks/uploaded/${id}/${entry.path}`,
  };

  try {
    for (const fileEntry of files) {
      const key = `${prefix}${fileEntry.path}`;
      await env.DECKS.put(key, fileEntry.bytes, {
        httpMetadata: { contentType: contentTypeForPath(fileEntry.path) },
      });
      storedKeys.push(key);
    }
    await env.DECKS.put(`${prefix}meta.json`, JSON.stringify(metadata), {
      httpMetadata: { contentType: 'application/json; charset=UTF-8' },
    });
  } catch {
    if (storedKeys.length) await env.DECKS.delete(storedKeys);
    return responseJson({ error: 'The deck could not be stored.' }, 500);
  }

  return responseJson({ deck: metadata }, 201);
}

async function serveUploadedAsset(url, env) {
  const requested = decodeURIComponent(url.pathname.slice('/internal-decks/uploaded/'.length));
  const separator = requested.indexOf('/');
  const id = separator >= 0 ? requested.slice(0, separator) : '';
  const path = separator >= 0 ? requested.slice(separator + 1) : '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !path || path === 'meta.json' || safeZipPath(path) !== path) {
    return new Response('Not found.', { status: 404 });
  }

  const object = await env.DECKS.get(`decks/${id}/${path}`);
  if (!object) return new Response('Not found.', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (headers.get('Content-Type')?.startsWith('text/html')) {
    headers.set('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-pointer-lock');
    headers.set('Content-Disposition', 'inline');
  }
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!isInternalDeckPath(url.pathname)) return env.ASSETS.fetch(request);
    if (!hasValidPassword(request, env.INTERNAL_DECKS_PASSWORD ?? '')) return authRequired();

    if (url.pathname === '/internal-decks/api/decks' && request.method === 'GET') {
      return responseJson({ decks: await listUploadedDecks(env) });
    }
    if (url.pathname === '/internal-decks/api/decks' && request.method === 'POST') {
      return uploadDeck(request, env);
    }
    if (url.pathname.startsWith('/internal-decks/uploaded/')) {
      return serveUploadedAsset(url, env);
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
  },
};
