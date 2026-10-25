const http = require('http');

const port = process.env.PORT || 3000;
let requestCount = 0;

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (request.method !== 'GET' || !['/pingpong', '/pings'].includes(requestPath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end(`pong ${requestCount}`);

  if (requestPath === '/pingpong') {
    requestCount += 1;
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Ping-pong server listening on port ${port}`);
});
