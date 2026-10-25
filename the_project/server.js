const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const port = Number(process.env.PORT || 3001);
const imageUrl = process.env.IMAGE_URL || 'https://picsum.photos/1200';
const cacheDirectory = process.env.CACHE_DIRECTORY || '/app/data';
const imagePath = path.join(cacheDirectory, 'image.jpg');
const cacheMaxAge = 10 * 60 * 1000;
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

function sendPage(response) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Todo App</title>
    <style>
      body {
        align-items: center;
        background: #fff;
        color: #333;
        display: flex;
        flex-direction: column;
        font-family: Arial, sans-serif;
        margin: 0;
        min-height: 100vh;
      }
      main {
        align-items: center;
        display: flex;
        flex-direction: column;
        padding: 48px 20px 24px;
        width: min(700px, calc(100% - 40px));
      }
      h1 {
        font-size: 42px;
        margin: 0 0 28px;
      }
      img {
        border-radius: 10px;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
        display: block;
        height: auto;
        max-width: min(1200px, 100%);
        width: 506px;
      }
      form {
        display: flex;
        gap: 10px;
        margin-top: 28px;
        width: 100%;
      }
      input {
        border: 1px solid #bbb;
        border-radius: 4px;
        box-sizing: border-box;
        flex: 1;
        font-size: 16px;
        padding: 11px 12px;
      }
      button {
        background: #555;
        border: 0;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-size: 16px;
        padding: 0 22px;
      }
      ul {
        align-self: stretch;
        font-size: 18px;
        line-height: 1.5;
        margin: 28px 0 0;
        padding-left: 28px;
      }
      p {
        color: #666;
        font-size: 21px;
        font-weight: 600;
        margin: 28px 0 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Todo App</h1>
      <img src="/image" alt="A random picture from Lorem Picsum">
      <form>
        <input type="text" name="todo" maxlength="140" placeholder="Enter a newtodo (max 140 characters)" aria-label="Todo" required>
        <button type="button">Send</button>
      </form>
      <h2>Todos</h2>
      <ul>
        <li>Learn Kubernetes basics</li>
        <li>Deploy application to cluster</li>
        <li>Configure persistent volumes</li>
      </ul>
    </main>
  </body>
</html>`);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end('Method not allowed');
      return;
    }

    if (request.url === '/') {
      sendPage(response);
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