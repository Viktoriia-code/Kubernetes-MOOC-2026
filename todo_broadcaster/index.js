const { connect, StringCodec } = require('nats');

const natsUrl = process.env.NATS_URL;
const natsSubject = process.env.NATS_SUBJECT;
const queueGroup = process.env.NATS_QUEUE_GROUP;
const broadcastMode = process.env.BROADCAST_MODE || 'external';
const broadcastUrl = process.env.BROADCAST_URL;
const stringCodec = StringCodec();

if (!natsUrl || !natsSubject || !queueGroup) {
  throw new Error('Required broadcaster configuration is missing');
}
if (broadcastMode === 'external' && !broadcastUrl) {
  throw new Error('BROADCAST_URL is required in external mode');
}
if (broadcastMode !== 'external' && broadcastMode !== 'log') {
  throw new Error(`Unsupported BROADCAST_MODE: ${broadcastMode}`);
}

async function sendToExternalService(event) {
  let content;
  if (event.type === 'todo.created') {
    content = `A todo was created: ${event.todo.content}`;
  } else if (event.todo.done) {
    content = `A todo was marked as done: ${event.todo.content}`;
  } else {
    content = `A todo was marked as not done: ${event.todo.content}`;
  }

  const response = await fetch(broadcastUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'todo-bot',
      content,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`External service returned HTTP ${response.status}: ${errorBody}`);
  }
}

async function start() {
  const natsConnection = await connect({ servers: natsUrl });
  const subscription = natsConnection.subscribe(natsSubject, { queue: queueGroup });
  console.log(`Broadcaster listening on ${natsSubject} as ${queueGroup}`);

  for await (const message of subscription) {
    try {
      const event = JSON.parse(stringCodec.decode(message.data));
      if (broadcastMode === 'log') {
        console.log(`Received ${event.type} for todo ${event.todo.id}: ${JSON.stringify(event)}`);
      } else {
        await sendToExternalService(event);
        console.log(`Broadcast ${event.type} for todo ${event.todo.id}`);
      }
    } catch (error) {
      console.error(`Failed to broadcast NATS message: ${error.message}`);
    }
  }
}

start().catch((error) => {
  console.error(`Broadcaster failed to start: ${error.message}`);
  process.exitCode = 1;
});
