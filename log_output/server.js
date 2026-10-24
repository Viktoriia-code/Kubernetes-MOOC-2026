const http = require('http');
const fs = require('fs');

const port = process.env.PORT || 3000;
const statusFile = process.env.STATUS_FILE || '/usr/src/app/files/status.txt';

const server = http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/status') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  fs.readFile(statusFile, 'utf8', (error, contents) => {
    if (error) {
      console.error(`Failed to read status file: ${error.message}`);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Could not read status file');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end(contents);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Status server listening on port ${port}`);
});
