# Exercise 4.8 - The project, step 24

## Task
> Move the project to use GitOps so that when you commit to the repository, the application is automatically updated. In this exercise, it is enough that the main branch is deployed to cluster.

## Task implementation

GitHub Actions runs the [`project-gitops.yaml`](../.github/workflows/project-gitops.yaml) workflow for changes pushed to `main`. It builds and pushes the Todo Backend image to Docker Hub, updates this Kustomization with the commit SHA, and commits the new image reference. Argo CD then detects the Git change and deploys the updated backend to the cluster.

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
