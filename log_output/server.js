const http = require('http');
const fs = require('fs');

const port = process.env.PORT || 3000;
const statusFile = process.env.STATUS_FILE || '/usr/src/app/files/status.txt';
const countFile = process.env.COUNT_FILE || '/usr/src/app/files/count.txt';

const server = http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/status') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  Promise.all([
    fs.promises.readFile(statusFile, 'utf8'),
    fs.promises.readFile(countFile, 'utf8'),
  ])
    .then(([contents, count]) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(`${contents}Ping / Pongs: ${count.trim()}\n`);
    })
    .catch((error) => {
      console.error(`Failed to read application status: ${error.message}`);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Could not read application status');
    });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Status server listening on port ${port}`);
});
