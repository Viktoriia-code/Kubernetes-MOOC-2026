const http = require('http');
const { Pool } = require('pg');

const port = Number(process.env.PORT);
const todoMaxLength = Number(process.env.TODO_MAX_LENGTH);
const databaseHost = process.env.DB_HOST;
const databasePort = Number(process.env.DB_PORT);
const databaseName = process.env.DB_NAME;
const databaseUser = process.env.DB_USER;
const databasePassword = process.env.DB_PASSWORD;
const pool = new Pool({
  host: databaseHost,
  port: databasePort,
  database: databaseName,
  user: databaseUser,
  password: databasePassword,
});

if (!Number.isFinite(port) || !Number.isFinite(todoMaxLength) || !databaseHost
  || !Number.isFinite(databasePort) || !databaseName || !databaseUser || !databasePassword) {
  throw new Error('Required todo backend configuration is missing or invalid');
}

async function initializeDatabase() {
  while (true) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS todos (
          id SERIAL PRIMARY KEY,
          content TEXT NOT NULL
        )
      `);
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM todos');
      if (result.rows[0].count === 0) {
        await pool.query(
          `INSERT INTO todos (content) VALUES
            ('Learn Kubernetes basics'),
            ('Deploy application to cluster'),
            ('Configure persistent volumes')`,
        );
      }
      console.log('Connected to PostgreSQL');
      return;
    } catch (error) {
      console.error(`Waiting for PostgreSQL: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
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
    try {
      const result = await pool.query('SELECT id, content FROM todos ORDER BY id');
      sendJson(response, 200, result.rows);
    } catch (error) {
      console.error(`Failed to read todos: ${error.message}`);
      sendJson(response, 500, { error: 'Could not access todos' });
    }
    return;
  }

  let todo;
  try {
    todo = JSON.parse(await readBody(request));
  } catch (error) {
    console.error(`Failed to parse todo request: ${error.message}`);
    sendJson(response, 400, { error: 'Request body must be valid JSON' });
    return;
  }

  try {
    console.log(`Todo submitted: ${JSON.stringify(todo.content)}`);
    if (typeof todo.content !== 'string' || todo.content.trim().length === 0 || todo.content.length > todoMaxLength) {
      console.warn(`Todo rejected: content must be between 1 and ${todoMaxLength} characters`);
      sendJson(response, 400, { error: `Todo content must be between 1 and ${todoMaxLength} characters` });
      return;
    }

    const result = await pool.query(
      'INSERT INTO todos (content) VALUES ($1) RETURNING id, content',
      [todo.content.trim()],
    );
    console.log(`Todo created: ${JSON.stringify(result.rows[0])}`);
    sendJson(response, 201, result.rows[0]);
  } catch (error) {
    console.error(`Failed to create todo: ${error.message}`);
    sendJson(response, 500, { error: 'Could not access todos' });
  }
});

initializeDatabase().then(() => {
  server.listen(port, '0.0.0.0', () => {
    console.log(`Todo backend listening on port ${port}`);
  });
});
