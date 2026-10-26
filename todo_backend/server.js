const http = require('http');

const port = Number(process.env.PORT);
const todoMaxLength = Number(process.env.TODO_MAX_LENGTH);
const todos = [
  { id: 1, content: 'Learn Kubernetes basics' },
  { id: 2, content: 'Deploy application to cluster' },
  { id: 3, content: 'Configure persistent volumes' },
];
let nextId = todos.length + 1;

if (!Number.isFinite(port) || !Number.isFinite(todoMaxLength)) {
  throw new Error('Required todo backend configuration is missing or invalid');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.url !== '/todos' || !['GET', 'POST'].includes(request.method)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  if (request.method === 'GET') {
    sendJson(response, 200, todos);
    return;
  }

  try {
    const todo = JSON.parse(await readBody(request));
    if (typeof todo.content !== 'string' || todo.content.trim().length === 0 || todo.content.length > todoMaxLength) {
      sendJson(response, 400, { error: `Todo content must be between 1 and ${todoMaxLength} characters` });
      return;
    }

    const createdTodo = { id: nextId, content: todo.content.trim() };
    nextId += 1;
    todos.push(createdTodo);
    sendJson(response, 201, createdTodo);
  } catch (error) {
    console.error(`Failed to create todo: ${error.message}`);
    sendJson(response, 400, { error: 'Request body must be valid JSON' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Todo backend listening on port ${port}`);
});
