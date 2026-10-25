const http = require('http');
const fs = require('fs').promises;

const port = process.env.PORT || 3000;
const countFile = process.env.COUNT_FILE || '/usr/src/app/files/count.txt';

async function getNextRequestCount() {
  let count = 0;

  try {
    count = Number.parseInt(await fs.readFile(countFile, 'utf8'), 10);
    if (Number.isNaN(count)) {
      throw new Error(`Invalid request count in ${countFile}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const nextCount = count + 1;
  await fs.writeFile(countFile, String(nextCount));
  return nextCount;
}

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (request.method !== 'GET' || requestPath !== '/pingpong') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  try {
    const requestCount = await getNextRequestCount();
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end(`pong ${requestCount}`);
  } catch (error) {
    console.error(`Failed to update request count: ${error.message}`);
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Could not update request count');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Ping-pong server listening on port ${port}`);
});
