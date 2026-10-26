const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const port = Number(process.env.PORT || 3001);
const imageUrl = process.env.IMAGE_URL || 'https://picsum.photos/1200';
const cacheDirectory = process.env.CACHE_DIRECTORY || '/app/data';
const imagePath = path.join(cacheDirectory, 'image.jpg');
const cacheMaxAge = 10 * 60 * 1000;
const todoBackendUrl = process.env.TODO_BACKEND_URL || 'http://todo-backend-svc.project:2345';
let refreshPromise;

async function downloadImage() {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image API returned status ${response.status}`);
  }

  const image = Buffer.from(await response.arrayBuffer());
  const temporaryPath = `${imagePath}.tmp`;
  await fs.writeFile(temporaryPath, image);
  await fs.rename(temporaryPath, imagePath);
  console.log(`Cached a new image at ${new Date().toISOString()}`);
}

function refreshImage() {
  if (!refreshPromise) {
    refreshPromise = downloadImage().finally(() => {
      refreshPromise = undefined;
    });
  }
  return refreshPromise;
}

async function getCachedImage() {
  try {
    const stats = await fs.stat(imagePath);
    if (Date.now() - stats.mtimeMs > cacheMaxAge) {
      refreshImage().catch((error) => {
        console.error(`Failed to refresh cached image: ${error.message}`);
      });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await refreshImage();
  }

  return fs.readFile(imagePath);
}

const publicDirectory = path.join(__dirname, 'public');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const staticFiles = {
  '/': 'index.html',
  '/styles.css': 'styles.css',
  '/app.js': 'app.js',
};

async function sendStatic(response, fileName) {
  const filePath = path.join(publicDirectory, fileName);
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(fileName)] || 'application/octet-stream',
  });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/todos' && (request.method === 'GET' || request.method === 'POST')) {
      const backendResponse = await fetch(`${todoBackendUrl}/todos`, {
        method: request.method,
        headers: request.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: request.method === 'POST' ? await new Promise((resolve, reject) => {
          let body = '';
          request.on('data', (chunk) => { body += chunk; });
          request.on('end', () => resolve(body));
          request.on('error', reject);
        }) : undefined,
      });
      response.writeHead(backendResponse.status, {
        'Content-Type': backendResponse.headers.get('content-type') || 'text/plain',
      });
      response.end(await backendResponse.text());
      return;
    }

    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end('Method not allowed');
      return;
    }

    if (staticFiles[request.url]) {
      await sendStatic(response, staticFiles[request.url]);
      return;
    }

    if (request.url === '/image') {
      const image = await getCachedImage();
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
      response.end(image);
      return;
    }

    response.writeHead(404);
    response.end('Not found');
  } catch (error) {
    console.error(`Failed to serve request: ${error.message}`);
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Could not serve the project');
  }
});

fs.mkdir(cacheDirectory, { recursive: true })
  .then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`Server started on port ${port}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to create cache directory: ${error.message}`);
    process.exitCode = 1;
  });