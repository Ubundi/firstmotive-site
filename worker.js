import { unzipSync } from 'fflate';

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 250;
const MAX_NESTED_ARCHIVE_DEPTH = 5;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

function isInternalDeckPath(pathname) {
  return pathname === '/internal-decks' || pathname.startsWith('/internal-decks/');
}

/* Agent-readable docs: llms.txt + Markdown mirrors of the page sections.
   Generated from index.html by scripts/build-agent-docs.mjs. */
const AGENT_DOC_PATHS = new Set([
  '/llms.txt',
  '/index.md',
  '/robot-training-data.md',
  '/what-we-do.md',
  '/how-we-work.md',
  '/cowork.md',
]);

async function serveAgentDoc(request, env) {
  const assetResponse = await env.ASSETS.fetch(request);
  if (!assetResponse.ok) return assetResponse;
  const response = new Response(assetResponse.body, assetResponse);
  const pathname = new URL(request.url).pathname;
  response.headers.set(
    'Content-Type',
    pathname.endsWith('.md') ? 'text/markdown; charset=UTF-8' : 'text/plain; charset=UTF-8',
  );
  response.headers.set('Cache-Control', 'public, max-age=300');
  response.headers.set('Link', '<https://firstmotive.ai/>; rel="canonical"');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Robots-Tag', 'noindex, follow');
  return response;
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

function sortFiles(files) {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

function unpackArchive(bytes) {
  const archive = unzipSync(bytes);
  let files = Object.entries(archive)
    .filter(([rawPath]) => !rawPath.endsWith('/'))
    .map(([rawPath, fileBytes]) => ({ path: safeZipPath(rawPath), bytes: fileBytes }))
    .filter(({ path }) => path);
  files = stripCommonRoot(files);

  if (!files.length) throw new Error('The ZIP package is empty.');
  if (files.length > MAX_FILES) throw new Error(`ZIP packages may contain at most ${MAX_FILES} files.`);

  const paths = new Set();
  let unpackedBytes = 0;
  for (const file of files) {
    if (paths.has(file.path)) throw new Error('The ZIP package contains duplicate or unsafe paths.');
    paths.add(file.path);
    unpackedBytes += file.bytes.byteLength;
    if (unpackedBytes > MAX_UNPACKED_BYTES) throw new Error('The unpacked package is too large.');
  }
  return sortFiles(files);
}

function findHtmlEntry(files) {
  const htmlFiles = files.filter(({ path }) => /\.html?$/.test(path.toLowerCase()));
  return htmlFiles.find(({ path }) => path.toLowerCase().endsWith('/index.html') || path.toLowerCase() === 'index.html')
    ?? htmlFiles.find(({ path }) => path.toLowerCase().endsWith('/index.htm') || path.toLowerCase() === 'index.htm')
    ?? htmlFiles[0]
    ?? null;
}

function findEntryIteratively(bytes, depth = 0) {
  const files = unpackArchive(bytes);
  const entry = findHtmlEntry(files);
  if (entry) return { files, entry };
  if (depth >= MAX_NESTED_ARCHIVE_DEPTH) return null;

  const nestedArchives = files
    .filter(({ path }) => /\.zip$/i.test(path))
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const nested of nestedArchives) {
    try {
      const result = findEntryIteratively(nested.bytes, depth + 1);
      if (result) return result;
    } catch {
      // Continue deterministically to the next nested archive.
    }
  }
  return null;
}

function isGoogleDriveHost(hostname) {
  return hostname === 'drive.google.com'
    || hostname === 'drive.usercontent.google.com'
    || hostname === 'drive.googleusercontent.com'
    || hostname === 'docs.google.com';
}

function driveFileIdFromUrl(rawValue) {
  let url;
  try {
    url = new URL(String(rawValue ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isGoogleDriveHost(url.hostname)) return null;

  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  const candidate = pathMatch?.[1] ?? url.searchParams.get('id');
  return candidate && DRIVE_ID_PATTERN.test(candidate) ? candidate : null;
}

function encodeDriveId(fileId) {
  return btoa(fileId).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeDriveId(token) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((token.length + 3) % 4);
    const fileId = atob(padded);
    return DRIVE_ID_PATTERN.test(fileId) ? fileId : null;
  } catch {
    return null;
  }
}

function isZipBytes(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function confirmationTokenFromHtml(bytes) {
  const text = new TextDecoder().decode(bytes.slice(0, 256 * 1024));
  return text.match(/[?&]confirm=([A-Za-z0-9_-]+)/)?.[1]
    ?? text.match(/name=["']confirm["'][^>]*value=["']([^"']+)/i)?.[1]
    ?? null;
}

async function downloadDriveZip(fileId) {
  const baseUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
  let url = baseUrl;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error('Google Drive did not return the ZIP package.');
    const contentLength = Number(response.headers.get('Content-Length') ?? 0);
    if (contentLength > MAX_ZIP_BYTES) throw new Error('ZIP packages must be 50 MB or smaller.');

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('ZIP packages must be 50 MB or smaller.');
    if (isZipBytes(bytes)) return bytes;

    const confirmation = confirmationTokenFromHtml(bytes);
    if (!confirmation) throw new Error('The Google Drive link did not resolve to a public ZIP package.');
    url = `https://drive.google.com/uc?export=download&confirm=${encodeURIComponent(confirmation)}&id=${encodeURIComponent(fileId)}`;
  }
  throw new Error('Google Drive did not provide the ZIP package after confirmation.');
}

async function extractDrivePackage(fileId) {
  const zipBytes = await downloadDriveZip(fileId);
  const result = findEntryIteratively(zipBytes);
  if (!result) throw new Error('The ZIP package and its nested ZIPs contain no HTML file.');
  return result;
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

function driveDeckHref(request, fileId, entryPath) {
  const token = encodeDriveId(fileId);
  const encodedPath = entryPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${new URL(request.url).origin}/internal-decks/drive/${token}/${encodedPath}`;
}

async function addDriveDeck(request) {
  if (!uploadOriginIsAllowed(request)) return responseJson({ error: 'Upload origin is not allowed.' }, 403);

  const form = await request.formData();
  const title = cleanField(form.get('title'), 120);
  const team = cleanField(form.get('team'), 120);
  const date = cleanField(form.get('date'), 10);
  const driveUrl = cleanField(form.get('driveUrl'), 500);
  const fileId = driveFileIdFromUrl(driveUrl);

  if (!title || !team || !isValidDate(date)) return badRequest('Enter a title, team, and valid deck date.');
  if (!fileId) return badRequest('Paste a public Google Drive file link containing a ZIP package.');

  let extracted;
  try {
    extracted = await extractDrivePackage(fileId);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'The Google Drive ZIP could not be read.');
  }

  const metadata = {
    id: crypto.randomUUID(),
    title,
    team,
    date,
    entry: extracted.entry.path,
    originalFilename: 'Google Drive ZIP package',
    source: 'Google Drive',
    createdAt: new Date().toISOString(),
    href: driveDeckHref(request, fileId, extracted.entry.path),
  };
  return responseJson({ deck: metadata }, 201);
}

async function serveDriveAsset(url) {
  const remainder = url.pathname.slice('/internal-decks/drive/'.length);
  const separator = remainder.indexOf('/');
  const token = separator >= 0 ? remainder.slice(0, separator) : '';
  let path;
  try {
    path = decodeURIComponent(separator >= 0 ? remainder.slice(separator + 1) : '');
  } catch {
    return new Response('Not found.', { status: 404 });
  }
  const fileId = decodeDriveId(token);
  if (!fileId || !path || safeZipPath(path) !== path) return new Response('Not found.', { status: 404 });

  let extracted;
  try {
    extracted = await extractDrivePackage(fileId);
  } catch {
    return new Response('The public Google Drive ZIP could not be read.', { status: 502 });
  }
  const file = extracted.files.find(({ path: filePath }) => filePath === path);
  if (!file) return new Response('Not found.', { status: 404 });

  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': contentTypeForPath(file.path),
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  if (/\.html?$/i.test(file.path)) {
    headers.set('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-pointer-lock');
    headers.set('Content-Disposition', 'inline');
  }
  return new Response(file.bytes, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (AGENT_DOC_PATHS.has(url.pathname)) return serveAgentDoc(request, env);
    if (!isInternalDeckPath(url.pathname)) return env.ASSETS.fetch(request);
    if (!hasValidPassword(request, env.INTERNAL_DECKS_PASSWORD ?? '')) return authRequired();

    if (url.pathname === '/internal-decks/api/decks' && request.method === 'GET') {
      return responseJson({ decks: [] });
    }
    if (url.pathname === '/internal-decks/api/decks' && request.method === 'POST') {
      return addDriveDeck(request);
    }
    if (url.pathname.startsWith('/internal-decks/drive/')) {
      return serveDriveAsset(url);
    }

    const assetRequest = new Request(request);
    assetRequest.headers.delete('Authorization');
    const assetResponse = await env.ASSETS.fetch(assetRequest);
    const response = new Response(assetResponse.body, assetResponse);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  },
};
