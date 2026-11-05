const { connect, StringCodec } = require('nats');

const natsUrl = process.env.NATS_URL;
const natsSubject = process.env.NATS_SUBJECT;
const queueGroup = process.env.NATS_QUEUE_GROUP;
const broadcastUrl = process.env.BROADCAST_URL;
const stringCodec = StringCodec();

if (!natsUrl || !natsSubject || !queueGroup || !broadcastUrl) {
  throw new Error('Required broadcaster configuration is missing');
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
      await sendToExternalService(event);
      console.log(`Broadcast ${event.type} for todo ${event.todo.id}`);
    } catch (error) {
      console.error(`Failed to broadcast NATS message: ${error.message}`);
    }
  }
}

start().catch((error) => {
  console.error(`Broadcaster failed to start: ${error.message}`);
  process.exitCode = 1;
});
