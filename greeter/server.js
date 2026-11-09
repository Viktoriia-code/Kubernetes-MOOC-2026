const http = require('http');

const port = process.env.PORT || 3000;
const greeting = process.env.GREETING || 'hello';

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end(`${greeting}\n`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Greeter listening on port ${port}`);
});
