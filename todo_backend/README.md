# Exercise 2.8 - The project, step 11

## Task
Create a CronJob that generates a new todo every hour to remind you to do 'Read <URL>', here <URL> is a Wikipedia article that was decided by the job randomly. It does not have to be a hyperlink, the user can copy-paste the URL from the todo.

https://en.wikipedia.org/wiki/Special:Random responds with a redirect to a random Wikipedia page so you can ask it to provide a random article for you to read. TIP: Check location header

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
curl.exe -X POST http://localhost:2345/todos `
  -H "Content-Type: application/json" `
  -d '{\"content\":\"Read the Kubernetes documentation\"}'
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

## Build the image

Run these commands from the `todo_backend` directory:

```powershell
docker build -t vikikone/todo-backend:v2.8 .
docker push vikikone/todo-backend:v2.8
```

## Deploy to Kubernetes

Create the project namespace if it does not exist:

```powershell
kubectl create namespace project
```

Apply all backend, database, and Service manifests:

```powershell
kubectl apply -f .\manifests
kubectl rollout status statefulset/postgres -n project
kubectl rollout status deployment/todo-backend -n project
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
kubectl delete -f .\manifests -n project
```
