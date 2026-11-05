# Exercise 4.5 - The project, step 22

## Task
> Speaking of updating. Our todo application could use "Done" field for todos that are already done. It should be a PUT request to `/todos/<id>`.

## Implementation

The `PUT /todos/<id>` endpoint updates the completion state of one todo. The
`<id>` must be the numeric ID returned by `GET /todos`, and the request body
must contain a boolean `done` field:

```http
PUT /todos/1
Content-Type: application/json

{ "done": true }
```

For a successful update, the backend executes a parameterized PostgreSQL
`UPDATE` query and returns HTTP `200` with the updated row:

```json
{
  "id": 1,
  "content": "Learn Kubernetes basics",
  "done": true
}
```

<img width="422" height="422" alt="Screenshot 2026-11-05 150547" src="https://github.com/user-attachments/assets/bee3152b-7abf-49da-af32-82b7eb4e1c78" />

The endpoint also supports setting a todo back to incomplete:

```powershell
curl.exe -X PUT http://localhost:2345/todos/2 `
  -H "Content-Type: application/json" `
  -d '{ "done": false }'
```

Invalid JSON or a missing/non-boolean `done` field returns HTTP `400`. If the
numeric ID does not exist, the backend returns HTTP `404`. Database failures
are logged and return HTTP `500` without exposing database details to the
client.

During startup, the backend creates the `todos` table with a `done BOOLEAN NOT
NULL DEFAULT FALSE` column. It also runs an idempotent migration with
`ADD COLUMN IF NOT EXISTS`, so databases created by an earlier version gain the
new column while preserving all existing todo content. The `GET /todos`
response always includes `id`, `content`, and `done`, and newly created todos
start with `done: false`.

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
docker build -t gcr.io/dwk-gke-513110/todo-backend:3.5 .
```
Configure Docker authentication for Google Container Registry and push the image:
```powershell
gcloud auth configure-docker gcr.io
docker push gcr.io/dwk-gke-513110/todo-backend:3.5
```
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

docker run -d --name todo-backend --network todo-network -p 2345:2345 `
  -e PORT=2345 `
  -e TODO_MAX_LENGTH=140 `
  -e DB_HOST=todo-postgres `
  -e DB_PORT=5432 `
  -e DB_NAME=todo `
  -e DB_USER=todo `
  -e DB_PASSWORD=todo `
  todo-backend:local
```

The API is available at `http://localhost:2345/todos` and running in the background.

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
