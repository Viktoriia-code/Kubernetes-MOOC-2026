# Exercise 3.5 - The project, step 14

## Task
Configure the project to use Kustomize, and deploy it to Google Kubernetes Engine.

## Application
The Todo backend is a Node.js HTTP service used by the project frontend. It provides a small JSON API for reading and creating todo items. Todo data is stored in PostgreSQL instead of in application memory. The project frontend renders URLs in todo content as clickable links.

## API

### `GET /todos`

Returns all todos ordered by their database ID:

```json
[
  {
    "id": 1,
    "content": "Learn Kubernetes basics"
  }
]
```

### `POST /todos`

Creates a todo from a JSON request body:

```powershell
$body = @{ content = "Read the Kubernetes documentation" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:8081/todos" `
  -Method Post -ContentType "application/json" -Body $body
```

The content must contain between 1 and 140 characters. A successful request returns the created todo with status `201`. Invalid JSON or content returns status `400`.

## PostgreSQL persistence

When the backend starts, it waits for PostgreSQL to become available. It then:

1. Creates the `todos` table if it does not exist.
2. Adds the initial example todos if the table is empty.
3. Starts the HTTP server.

The PostgreSQL database runs as a one-replica StatefulSet named `postgres` in the `project` namespace. Its `volumeClaimTemplates` creates a persistent 1 GiB volume, so todos remain available when the backend or database pod is recreated.

## Configuration

Runtime configuration is supplied by the
[`todo-backend-config`](./manifests/configmap.yaml) ConfigMap:

| Variable | Purpose |
|---|---|
| `PORT` | Port used by the backend container |
| `TODO_MAX_LENGTH` | Maximum todo content length |
| `DB_HOST` | PostgreSQL Service hostname |
| `DB_PORT` | PostgreSQL port |
| `DB_NAME` | PostgreSQL database name |
| `DB_USER` | PostgreSQL username |

The database password is supplied separately through the [`todo-database-secret`](./manifests/postgres-secret.yaml) Secret as `DB_PASSWORD`.

## Request logging and validation

Every submitted todo is written to the container log. Successfully stored
todos use the `Todo created:` message, while invalid submissions use
`Todo rejected:`. Todos longer than 140 characters are rejected with HTTP
status `400` before they are stored.

Test a valid todo through the project Ingress:

```powershell
$body = @{ content = "Read the Kubernetes documentation" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:8081/todos" `
  -Method Post -ContentType "application/json" -Body $body
```

Test the backend limit with a 141-character todo:

```powershell
$tooLong = "x" * 141
$body = @{ content = $tooLong } | ConvertTo-Json -Compress

try {
    Invoke-RestMethod -Uri "http://localhost:8081/todos" `
      -Method Post -ContentType "application/json" -Body $body
} catch {
    $_.ErrorDetails.Message
}
```

View the backend logs directly:

```powershell
kubectl logs -n project deployment/todo-backend
```

In Grafana, select the Loki datasource and use this LogQL query to find submissions:

```text
{namespace="project"}
```

The Grafana datasource is provisioned from [`monitoring/grafana-values.yaml`](../monitoring/grafana-values.yaml). The values file configures the Loki tenant header `X-Scope-OrgID: 1`; provisioned datasources cannot be edited from the Grafana UI.

## Deploy to Google Kubernetes Engine

The backend runs inside the `project` namespace and is reached by the frontend through the internal `todo-backend-svc.project:2345` Service. Follow the Google Cloud and cluster setup instructions in the [project README](../todo_app/README.md#deploy-to-google-kubernetes-engine) before deploying the backend.

The PostgreSQL StatefulSet uses a dynamic `local-path` storage class in the committed manifests. On GKE, change it to a storage class available in your cluster, such as `standard-rwo`, before applying the Kustomization.

## Build the image

From the `todo_backend` directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/todo-backend:3.5 .
```
Configure Docker authentication for Google Container Registry and push the image:
```powershell
gcloud auth configure-docker gcr.io
docker push gcr.io/dwk-gke-513110/todo-backend:3.5
```

## Deploy the backend to GKE

Create the project namespace if it does not exist:

```powershell
kubectl create namespace project
```

If the namespace already exists, continue with the Kustomize command.

Apply all backend, database, and Service resources with Kustomize:

```powershell
kubectl apply -k .
kubectl rollout status statefulset/postgres -n project
kubectl rollout status deployment/todo-backend -n project
```

The frontend can now be deployed from the `the_project` directory:

```powershell
cd ..\todo_app
kubectl apply -k .
kubectl rollout status deployment/todo-app -n project
```

Check the resources:

```powershell
kubectl get deployments,statefulset,pods,pvc -n project
kubectl get services -n project
kubectl logs -n project deployment/todo-backend
kubectl get cronjob,jobs -n project
```

The backend is available inside the cluster through `todo-backend-svc.project:2345`. The project frontend uses this Service rather than calling the backend directly from outside the cluster.

## Hourly Wikipedia reminder

The [`todo-reminder`](./manifests/cronjob.yaml) CronJob runs at the start of every hour. It follows the redirect from Wikipedia's random article endpoint and sends a todo in the form `Read <URL>` to the backend. The backend URL and Wikipedia URL are defined in [`cronjob-configmap.yaml`](./manifests/cronjob-configmap.yaml).

Create a one-off Job to test the CronJob immediately:

```powershell
kubectl create job --from=cronjob/todo-reminder todo-reminder-manual -n project
kubectl logs -n project -f job/todo-reminder-manual
kubectl delete job todo-reminder-manual -n project
```

## Remove the backend resources

```powershell
kubectl delete -k . -n project
```
