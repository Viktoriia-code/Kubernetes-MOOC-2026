# Exercise 2.10 - The project, step 13

## Task
The project could really use logging.

Add request logging so that you can monitor every todo that is sent to the backend.

Set the limit of 140 characters for todos in the backend as well. Use Postman or curl to test that too long todos are blocked by the backend, and you can see the non-allowed messages in your Grafana.

## What was done

- Runtime ports, URLs, cache settings, and todo length are provided through
  ConfigMaps.
- The project frontend displays todos and sends new todos to the backend.
- The todo backend stores todos in PostgreSQL instead of application memory.
- PostgreSQL runs as a one-replica StatefulSet in the `project` namespace.
- PostgreSQL uses a persistent volume claim created by its
  `volumeClaimTemplates`.
- The backend receives database host, port, name, and user through a ConfigMap.
- The database password is provided through a Kubernetes Secret.
- The backend waits for PostgreSQL before starting its HTTP server.
- Initial example todos are inserted only when the database table is empty.
- An hourly CronJob creates a todo containing a randomly selected Wikipedia article URL.
- Wikipedia article URLs in todos are rendered as clickable links in the frontend.
- Every submitted todo is logged by the backend.
- Todos longer than 140 characters are rejected by the backend with HTTP 400.
- Rejected submissions are logged with `Todo rejected:` so they can be found in Loki and Grafana.
- Grafana is configured with Prometheus and Loki datasources.
- The Loki datasource uses the `X-Scope-OrgID: 1` tenant header.
- Grafana datasource configuration is stored in [`monitoring/grafana-values.yaml`](../monitoring/grafana-values.yaml).

The backend API is documented in
[`todo_backend/README.md`](../todo_backend/README.md).

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v2.10`

The backend image is `vikikone/todo-backend:v2.10`.

## Implementation steps

### 1. Build and push the image

From the `the_project` directory:

```powershell
docker build -t vikikone/todo-app:v2.10 .
docker push vikikone/todo-app:v2.10

cd ..\todo_backend
docker build -t vikikone/todo-backend:v2.10 .
docker push vikikone/todo-backend:v2.10

cd ..\the_project
```

### 2. Deploy the application

Create the namespace with the kubectl command before applying the project resources:

```bash
kubectl create namespace project
```

Run these commands from the `the_project` directory:

```bash
kubectl apply -f ..\todo_backend\manifests
kubectl apply -f manifests
kubectl rollout status statefulset/postgres -n project
kubectl rollout status deployment/todo-backend -n project
kubectl rollout status deployment/the-project -n project
```

For Grafana and Loki monitoring, install or upgrade Grafana with the committed
values file:

```powershell
helm upgrade --install grafana grafana/grafana `
  --namespace monitoring `
  --create-namespace `
  --values ..\monitoring\grafana-values.yaml
```

The `todo-reminder` CronJob runs at the start of every hour. To trigger it manually while testing:

```powershell
kubectl create job --from=cronjob/todo-reminder todo-reminder-manual -n project
kubectl logs -n project -f job/todo-reminder-manual
kubectl delete job todo-reminder-manual -n project
```

### 3. Check the resources

```bash
kubectl get deployments,statefulset,pods,pvc -n project
kubectl get svc,ingress -n project
kubectl logs -n project -f deployment/the-project
kubectl logs -n project deployment/todo-backend
kubectl get cronjob,jobs -n project
```

To open Grafana locally:

```powershell
kubectl port-forward --namespace monitoring svc/grafana 3000:80
```

In Grafana, select **Explore**, choose **Loki**, and query rejected todos:

```text
{namespace="project"}
```

### 4. Access the application

Open <http://localhost:8081/> in a browser, or use:

```bash
curl http://localhost:8081/
```

The traffic flow is:

```text
localhost:8081
  -> Ingress port 80
  -> the-project-ingress
  -> the-project:3004
  -> Pod:3001
  -> cached image application
```

## Test image caching

Open the page in a browser or request the image directly:

```powershell
curl.exe http://localhost:8081/
curl.exe -o image-1.jpg http://localhost:8081/image
```

The first image request downloads and stores the image. Requests during the next ten minutes reuse the persistent cached file. After ten minutes, one request may still receive the old image while the application refreshes the cache in the background; a subsequent request receives the new image.

## Stop and restart the application

To stop the application while keeping its Kubernetes resources:

```bash
kubectl scale deployment/the-project --replicas=0 -n project
```

To start it again:

```bash
kubectl scale deployment/the-project --replicas=1 -n project
kubectl rollout status deployment/the-project -n project
```

The cached image remains available after the pod is recreated because it is
stored in the persistent volume.

## Remove the application resources

```bash
kubectl delete -f manifests -n project
```
