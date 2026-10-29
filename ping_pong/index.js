const http = require('http');
const { Pool } = require('pg');

const port = Number(process.env.PORT);
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

if (!Number.isFinite(port) || !databaseHost || !Number.isFinite(databasePort)
  || !databaseName || !databaseUser || !databasePassword) {
  throw new Error('Required Ping-pong configuration is missing or invalid');
}

async function initializeDatabase() {
  while (true) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS counter (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          value INTEGER NOT NULL
        )
      `);
      await pool.query('INSERT INTO counter (id, value) VALUES (1, 0) ON CONFLICT (id) DO NOTHING');
      console.log('Connected to PostgreSQL');
      return;
    } catch (error) {
      console.error(`Waiting for PostgreSQL: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function getCount(increment) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      increment
        ? 'UPDATE counter SET value = value + 1 WHERE id = 1 RETURNING value - 1 AS value'
        : 'SELECT value FROM counter WHERE id = 1',
    );
    await client.query('COMMIT');
    return result.rows[0].value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (request.method !== 'GET' || !['/', '/pingpong', '/pings'].includes(requestPath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  if (requestPath === '/') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('OK');
    return;
  }

  try {
    const requestCount = await getCount(requestPath === '/pingpong');
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end(`pong ${requestCount}`);
  } catch (error) {
    console.error(`Failed to access counter: ${error.message}`);
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Could not access counter');
  }
});

initializeDatabase().then(() => {
  server.listen(port, '0.0.0.0', () => {
    console.log(`Ping-pong server listening on port ${port}`);
  });
});
