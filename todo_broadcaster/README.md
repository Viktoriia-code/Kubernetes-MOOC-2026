# 4.6 - The project, step 23

## Task

> Create a new separate service for sending status messages of the todos to some chat service. Let's call the new service "broadcaster".
> 
> Requirements:
> 
> * The backend should send a message to NATS on saving or updating todos 
> * The broadcaster should subscribe to NATS messages
> * The broadcaster should send the message forward to an external service in a format they support
> 
> As the external service you can choose either:
> 
> * Discord
> * Telegram
> * Slack
> * or if you don't want to use them, use "Generic" where a URL is set as an Environment variable and the payload is e.g.
> 
> ```text
> {
>   "user": "bot",
>   "message": "A todo was created"
> }
> ```
> The broadcaster should be able to be scaled without sending the message multiple times. Test that it can run with 6 replicas without issues. The messages only have to be sent to the external service if all of the services are working correctly. So a randomly missing message is not an issue but a duplicate is.

## Todo broadcaster

The broadcaster is a separate microservice for Exercise 4.6. It listens for todo events from NATS and forwards them to an external chat service. The current implementation supports Discord-compatible webhooks.

## Message flow

1. The todo backend saves or updates a todo in PostgreSQL.
2. The backend publishes an event to the NATS subject `todo.events`.
3. The broadcaster receives the event through the `todo-broadcasters` queue group.
4. One broadcaster replica sends a message to the configured webhook.

All six replicas use the same queue group. NATS therefore delivers each event to one replica instead of broadcasting the event six times.

## Configuration

Set `BROADCAST_URL` in [`manifests/configmap.yaml`](./manifests/configmap.yaml) to a valid Discord webhook URL. The other values must match the backend configuration:

```yaml
NATS_URL: nats://my-nats.nats.svc.cluster.local:4222
NATS_SUBJECT: todo.events
NATS_QUEUE_GROUP: todo-broadcasters
```

The broadcaster sends Discord's supported webhook fields:

```json
{
  "username": "todo-bot",
  "content": "A todo was marked as done: Learn Kubernetes"
}
```

Do not commit webhook URLs to a public repository. Prefer a Kubernetes Secret for production deployments, and rotate a webhook immediately if it has been exposed.

## Build and deploy

Install NATS in the cluster if it is not already running:

```powershell
helm repo add nats https://nats-io.github.io/k8s/helm/charts/
helm repo update
helm upgrade --install my-nats nats/nats `
  --namespace nats `
  --create-namespace
```

Build and push the image:

```powershell
docker build -t vikikone/todo-broadcaster:4.8 .
docker push vikikone/todo-broadcaster:4.8
```

The image name and tag are defined in [`kustomization.yaml`](./kustomization.yaml). Deploy the six-replica workload:

```powershell
kubectl apply -k .
kubectl rollout status deployment/todo-broadcaster -n project
```

## Verify the deployment

Check that all replicas are ready:

```powershell
kubectl get deployment todo-broadcaster -n project
kubectl get pods -n project -l app=todo-broadcaster
```

View the broadcaster logs:

```powershell
kubectl logs -n project deployment/todo-broadcaster --tail=100
```

Expected startup output:

```text
Broadcaster listening on todo.events as todo-broadcasters
```

Create or update a todo after the broadcaster is running. Core NATS does not replay messages published before a subscriber connected. A successful delivery is logged as:

```text
Broadcast todo.created for todo 1
```

<img width="991" height="490" alt="image" src="https://github.com/user-attachments/assets/f4bd38ec-8b5f-42e9-bbc8-b2f6050cdaef" />
<img width="677" height="375" alt="image" src="https://github.com/user-attachments/assets/352eeca9-ede9-4539-9b06-14f5792150d5" />

## Troubleshooting

- Confirm the backend and broadcaster use the same `NATS_URL` and `NATS_SUBJECT`.
- Confirm the broadcaster deployment uses the image rendered by Kustomize: `kubectl kustomize .`.
- If Discord returns an error, inspect the broadcaster logs for its HTTP status and response body.
- If no event appears, check the backend logs for `Connected to NATS at ...` and create a new todo.
- If pods cannot pull the image, verify that the image was pushed to a registry accessible by the Kubernetes cluster.
