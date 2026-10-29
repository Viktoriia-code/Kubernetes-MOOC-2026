const http = require('http');
const fs = require('fs');

const port = process.env.PORT || 3000;
const statusFile = process.env.STATUS_FILE || '/usr/src/app/files/status.txt';
const informationFile = process.env.INFORMATION_FILE || '/usr/src/app/config/information.txt';
const message = process.env.MESSAGE || '';
const pingPongUrl = process.env.PINGPONG_URL || 'http://ping-pong-svc:80/pings';

function getPingPongCount() {
  return new Promise((resolve, reject) => {
    http.get(pingPongUrl, (pingPongResponse) => {
      let contents = '';

      pingPongResponse.on('data', (chunk) => {
        contents += chunk;
      });
      pingPongResponse.on('end', () => {
        if (pingPongResponse.statusCode !== 200) {
          reject(new Error(`Ping-pong returned status ${pingPongResponse.statusCode}`));
          return;
        }

        const match = contents.match(/^pong (\d+)$/);
        if (!match) {
          reject(new Error(`Unexpected Ping-pong response: ${contents}`));
          return;
        }

        resolve(match[1]);
      });
    }).on('error', reject);
  });
}

const server = http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/status') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  Promise.all([
    fs.promises.readFile(informationFile, 'utf8'),
    fs.promises.readFile(statusFile, 'utf8'),
    getPingPongCount(),
  ])
    .then(([information, contents, count]) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(`file content: ${information.trim()}\nenv variable: MESSAGE=${message}\n${contents}Ping / Pongs: ${count.trim()}\n`);
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
