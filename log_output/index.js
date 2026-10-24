const http = require('http');
const { v4: uuidv4 } = require('uuid');

const storedString = uuidv4();
const port = process.env.PORT || 3000;

function logWithTimestamp() {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp}: ${storedString}`);
}

const server = http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/status') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end(`${new Date().toISOString()}: ${storedString}`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Status server listening on port ${port}`);
});

setInterval(logWithTimestamp, 5000);
