# Exercise 3.5 - The project, step 14

## Task
Configure the project to use Kustomize, and deploy it to Google Kubernetes Engine.

## Application

The project is a todo application with a frontend and a separate backend.
The frontend displays todos and sends new ones to the backend, while the
backend stores them in PostgreSQL.

Runtime ports, URLs, cache settings, and the 140-character todo limit are provided through ConfigMaps. Database credentials are split between a ConfigMap and a Kubernetes Secret. The backend waits for PostgreSQL before starting, creates the database table when needed, and inserts initial example todos if the table is empty.

An hourly CronJob creates a todo containing a randomly selected Wikipedia article URL. These URLs are rendered as clickable links in the frontend. Every submitted todo is logged, and todos longer than 140 characters are rejected with HTTP 400. Rejected submissions are logged with `Todo rejected:` so they can be found in Loki and Grafana.

PostgreSQL runs as a one-replica StatefulSet in the `project` namespace with persistent storage created by its `volumeClaimTemplates`. Grafana is configured with Prometheus and Loki datasources. The Loki datasource uses the `X-Scope-OrgID: 1` tenant header, and its configuration is stored in [`monitoring/grafana-values.yaml`](../monitoring/grafana-values.yaml).

The backend API is documented in [`todo_backend/README.md`](../todo_backend/README.md).

## Docker image

The application image is built and tagged as:

`gcr.io/dwk-gke-513110/todo-app:3.5`

The backend image is `gcr.io/dwk-gke-513110/todo-backend:3.5`.

## Deploy to Google Kubernetes Engine

Create an account and a project `dwk-gke` on the Google Cloud.
Install Google Cloud SDK and gke-gcloud-auth-plugin.

Log in and select the Google Cloud project used for the exercise:

```powershell
gcloud -v
gcloud auth login
gcloud config set project dwk-gke-513110
```

Enable the Kubernetes Engine API:

```powershell
gcloud services enable container.googleapis.com
```

Create a cluster if you do not already have one. The following example uses a small zonal cluster in Finland:

```powershell
gcloud container clusters create dwk-cluster --zone=europe-north1-b --cluster-version=1.36 --disk-size=32 --num-nodes=4 --machine-type=e2-small
```

Configure `kubectl` to use the cluster:

```powershell
gcloud container clusters get-credentials dwk-cluster --zone=europe-north1-b
kubectl cluster-info
```

## Implementation steps

### 1. Build and push the image

From the `todo_app` directory:

```powershell
docker build -t gcr.io/dwk-gke-513110/todo-app:3.5 .
docker push gcr.io/dwk-gke-513110/todo-app:3.5

cd ..\todo_backend
docker build -t gcr.io/dwk-gke-513110/todo-backend:3.5 .
docker push gcr.io/dwk-gke-513110/todo-backend:3.5

cd ..\todo_app
```

### 2. Deploy the application

Create the namespace before applying the project resources:

```powershell
kubectl create namespace project
```

Run these commands from the `todo_app` directory:

```bash
kubectl apply -k ..\todo_backend
kubectl apply -k .
kubectl rollout status statefulset/postgres -n project
kubectl rollout status deployment/todo-backend -n project
kubectl rollout status deployment/todo-app -n project
```

If the namespace already exists, `kubectl create namespace project` may report
an `AlreadyExists` error; continue with the Kustomize commands.

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

### 4. Access the application on GKE

GKE provisions an external load balancer for the Ingress. Watch the Ingress until its `ADDRESS` is populated:

```powershell
kubectl get svc -n project
kubectl get ingress the-project-ingress -n project
```

Save the external IP and open the application:

Copy the external IP from the `ADDRESS` column and open `http://<INGRESS_IP>/` in your browser.

GKE may take several minutes to provision the load balancer. Open
`http://$INGRESS_IP/` in a browser, or use the `curl.exe` command above.

The traffic flow is:

```text
GKE external IP
  -> Ingress port 80
  -> the-project-ingress
  -> the-project:3004
  -> Pod:3001
  -> cached image application
```

## Test image caching

Use the GKE Ingress IP from the previous section:

```powershell
$BASE_URL = "http://$INGRESS_IP"
```

Open `$BASE_URL` in a browser or request the image directly:

```powershell
curl.exe "$BASE_URL/"
curl.exe -o image-1.jpg "$BASE_URL/image"
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
kubectl delete -k . -n project
```

To delete the GKE cluster and stop cluster charges:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```
