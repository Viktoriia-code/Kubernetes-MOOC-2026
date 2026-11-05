# 4.6 - The project, step 23

## Task

> Create a new separate service for sending status messages of the todos to some chat service. Let's call the new service "broadcaster".

## Implementation

In addition to serving the todo API, the backend publishes todo status events to NATS. The NATS connection and subject are configured in
[`manifests/configmap.yaml`](./manifests/configmap.yaml):

```yaml
NATS_URL: nats://my-nats.nats.svc.cluster.local:4222
NATS_SUBJECT: todo.events
```

The backend publishes an event only after the corresponding PostgreSQL operation succeeds:

```json
{
  "type": "todo.created",
  "todo": {
    "id": 2,
    "content": "Deploy application to cluster",
    "done": false
  }
}
```

An update uses `type: "todo.updated"` and includes the new `done` value. The [`todo_broadcaster`](../todo_broadcaster/README.md) service subscribes to this subject and forwards each event to the configured chat webhook.

<img width="991" height="490" alt="image" src="https://github.com/user-attachments/assets/5231a371-faba-4740-aa6e-d9df964ee474" />
<img width="677" height="375" alt="image" src="https://github.com/user-attachments/assets/352eeca9-ede9-4539-9b06-14f5792150d5" />

## Application
The Todo backend is a Node.js HTTP service used by the project frontend. It provides a small JSON API for reading, creating, and completing todo items. Todo data is stored in PostgreSQL instead of in application memory. The project frontend renders URLs in todo content as clickable links.

## Deploy to Google Kubernetes Engine

The backend runs inside the `project` namespace and is reached by the frontend through the internal `todo-backend-svc.project:2345` Service. Follow the Google Cloud and cluster setup instructions in the [project README](../todo_app/README.md#deploy-to-google-kubernetes-engine) before deploying the backend.

The PostgreSQL StatefulSet uses a dynamic `local-path` storage class in the committed manifests. On GKE, change it to a storage class available in your cluster, such as `standard-rwo`, before applying the Kustomization.

<details>
<summary>Configure Google Cloud</summary>

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
</details>

<details>
<summary>Build the image</summary>

From the `todo_backend` directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/todo-backend:4.6 .
```
Configure Docker authentication for Google Container Registry and push the image:
```powershell
gcloud auth configure-docker gcr.io
docker push gcr.io/dwk-gke-513110/todo-backend:4.6
```

Use the same image tag in [`kustomization.yaml`](./kustomization.yaml)
before deploying.
</details>

<details>
<summary>Build and run the image locally</summary>

Build the image from the `todo_backend` directory:

```powershell
docker build -t todo-backend:local .
```

Start the backend container by connecting it to a PostgreSQL container on the
same Docker network:

```powershell
docker network create todo-network
docker run -d --name todo-postgres --network todo-network `
  -e POSTGRES_DB=todo `
  -e POSTGRES_USER=todo `
  -e POSTGRES_PASSWORD=todo `
  postgres:16

The local container also needs a NATS server named `todo-nats` on
`todo-network`. For example:

```powershell
docker run -d --name todo-nats --network todo-network `
  -p 4222:4222 `
  nats:latest
```

Start the backend after PostgreSQL and NATS:

```powershell
docker run -d --name todo-backend --network todo-network -p 2345:2345 `
  -e PORT=2345 `
  -e TODO_MAX_LENGTH=140 `
  -e DB_HOST=todo-postgres `
  -e DB_PORT=5432 `
  -e DB_NAME=todo `
  -e DB_USER=todo `
  -e DB_PASSWORD=todo `
  -e NATS_URL=nats://todo-nats:4222 `
  -e NATS_SUBJECT=todo.events `
  todo-backend:local
```

The API is available at `http://localhost:2345/todos`.

Stop the backend:
```powershell
docker ps                    # Check running containers
docker logs todo-backend     # View backend logs
docker stop todo-backend     # Stop the backend
docker start todo-backend    # Start it again
```

Remove the PostgreSQL container when finished:

```powershell
docker rm -f todo-postgres
docker network rm todo-network
```
</details>

<details>
<summary>Deploy the backend to GKE</summary>

Create the project namespace if it does not exist:

```powershell
kubectl create namespace project
```

If the namespace already exists, continue with the Kustomize command.

Install NATS in the cluster before starting the backend:

```powershell
helm repo add nats https://nats-io.github.io/k8s/helm/charts/
helm repo update
helm upgrade --install my-nats nats/nats `
  --namespace nats `
  --create-namespace
```

The backend ConfigMap expects NATS at
`my-nats.nats.svc.cluster.local:4222`. If you use another NATS release name or
namespace, update `NATS_URL` in
[`manifests/configmap.yaml`](./manifests/configmap.yaml).

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

After creating or updating a todo, verify that the backend connected to NATS:

```powershell
kubectl logs -n project deployment/todo-backend --tail=100
```

The logs should contain:

```text
Connected to NATS at nats://my-nats.nats.svc.cluster.local:4222
```

Create a new todo after both the backend and broadcaster are running. Core NATS
does not replay events published before a subscriber connected.
</details>


<details>
<summary>Hourly Wikipedia reminder</summary>

The [`todo-reminder`](./manifests/cronjob.yaml) CronJob runs at the start of every hour. It follows the redirect from Wikipedia's random article endpoint and sends a todo in the form `Read <URL>` to the backend. The backend URL and Wikipedia URL are defined in [`cronjob-configmap.yaml`](./manifests/cronjob-configmap.yaml).

Create a one-off Job to test the CronJob immediately:

```powershell
kubectl create job --from=cronjob/todo-reminder todo-reminder-manual -n project
kubectl logs -n project -f job/todo-reminder-manual
kubectl delete job todo-reminder-manual -n project
```
</details>

<details>
<summary>Create a Cloud Storage bucket</summary>

Choose values for these placeholders:

```powershell
$PROJECT_ID = "YOUR_PROJECT_ID"
$BUCKET = "YOUR_UNIQUE_BUCKET_NAME"
$REGION = "europe-north1"

gcloud config set project $PROJECT_ID
gcloud storage buckets create "gs://$BUCKET" --location=$REGION
```

The bucket name must be globally unique. Use the same bucket name in the following steps and in the `GCS_BUCKET` entry in [`manifests/configmap.yaml`](./manifests/configmap.yaml).
</details>

<details>
<summary>Remove the backend resources</summary>

```powershell
kubectl delete -k . -n project
```

#### Avoid unnecessary GKE costs

The GKE Gateway and cluster can incur charges. Delete the cluster when it is no longer needed:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```

Remove the pushed images:
```powershell
$repositories = @(
    "gcr.io/dwk-gke-513110/todo-app",
    "gcr.io/dwk-gke-513110/todo-backend"
)

foreach ($repository in $repositories) {
    $tags = gcloud container images list-tags $repository --format=json | ConvertFrom-Json

    foreach ($image in $tags) {
        $digest = $image.digest

        if ($digest -notlike "sha256:*") {
            $digest = "sha256:$digest"
        }

        Write-Host "Deleting $repository@$digest"

        gcloud container images delete "$repository@$digest" --force-delete-tags --quiet
    }
}
```

Check that there is no images:
```powershell
gcloud container images list-tags gcr.io/dwk-gke-513110/todo-app
gcloud container images list-tags gcr.io/dwk-gke-513110/todo-backend
```

Deleting the cluster also deletes the deployed Kubernetes resources. When continuing the exercise, recreate the cluster, fetch its credentials, and apply the manifests again.
</details>
