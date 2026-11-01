# Exercise 3.10 - The project, step 18

## Task
Create now a CronJob that makes a backup of your todo database (once per 24 hours) and saves it to [Google Object Storage](https://cloud.google.com/storage).

## Daily database backups

The [`todo-db-backup`](./manifests/backup-cronjob.yaml) CronJob creates one backup every 24 hours at 02:00 UTC. The backup flow is:

1. Kubernetes starts a temporary backup Pod.
2. The Pod reads the PostgreSQL connection settings from [`configmap.yaml`](./manifests/configmap.yaml) and the database password from [`postgres-secret.yaml`](./manifests/postgres-secret.yaml).
3. `pg_dump` creates a PostgreSQL custom-format dump in the Pod's temporary filesystem.
4. `gcloud storage cp` uploads the dump to Google Cloud Storage.
5. The Pod exits, and Kubernetes keeps the Job status for troubleshooting.

The bucket name is stored in the non-secret [`manifests/configmap.yaml`](./manifests/configmap.yaml). The Google service-account key is stored only in the Kubernetes Secret named `storage-sa-key`; it is never included in the repository.

### 1. Create a Cloud Storage bucket

Choose values for these placeholders:

```powershell
$PROJECT_ID = "YOUR_PROJECT_ID"
$BUCKET = "YOUR_UNIQUE_BUCKET_NAME"
$REGION = "europe-north1"

gcloud config set project $PROJECT_ID
gcloud storage buckets create "gs://$BUCKET" --location=$REGION
```

The bucket name must be globally unique. Use the same bucket name in the following steps and in the `GCS_BUCKET` entry in [`manifests/configmap.yaml`](./manifests/configmap.yaml).

### 2. Create a restricted Google service account

This account only needs to create objects in the backup bucket. It does not need permission to delete or overwrite unrelated cloud resources:

```powershell
$SERVICE_ACCOUNT = "todo-storage-sa"

gcloud iam service-accounts create $SERVICE_ACCOUNT --display-name="Todo backup storage SA"

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectCreator"

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectViewer"
```

### 3. Create the Kubernetes Secret locally

Create the `project` namespace if it does not already exist:

``` powershell
kubectl create namespace project --dry-run=client -o yaml | kubectl apply -f -
```

For this exercise, authenticate the backup Pod with a service-account key. Create the key locally and immediately create the Secret in the `project` namespace:

```powershell
gcloud iam service-accounts keys create key.json --iam-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"

kubectl create secret generic storage-sa-key --from-file=key.json=key.json --namespace project
```

Verify the secret:

```powershell
kubectl get secret storage-sa-key -n project
```

The CronJob mounts this Secret at `/var/run/secrets/storage/key.json`, and the `GOOGLE_APPLICATION_CREDENTIALS` environment variable tells `gcloud` which file to use. Never commit `key.json`, paste it into GitHub, or add it to a ConfigMap. The repository's `.gitignore` also excludes this filename.

### 4. Configure and deploy the CronJob

Edit [`configmap.yaml`](./manifests/configmap.yaml) and replace `dwk-todo-backups` in `GCS_BUCKET` with the bucket created in step 1. Then deploy from the `todo_backend` directory:

```powershell
kubectl apply -k .
kubectl get cronjob todo-db-backup -n project
```

The CronJob uses `concurrencyPolicy: Forbid`, so a second backup cannot start while an earlier backup is still running. It also retains the last three successful and failed Job records.

### 5. Run a backup immediately

Do not wait for the scheduled time when testing. Create a one off Job from the CronJob and inspect its logs:

``` powershell
kubectl create job --from=cronjob/todo-db-backup todo-db-backup-manual -n project
kubectl logs -n project -f job/todo-db-backup-manual
```

The Job succeeds only after both `pg_dump` and the upload complete. Check the Job status:

``` powershell
kubectl get jobs -n project
```

A successful Job shows `Complete` and `1/1` completions.

Confirm that the object exists:

``` powershell
gcloud storage ls "gs://$BUCKET/"
```

The uploaded object has a name similar to `todos-YYYYMMDDTHHMMSSZ.dump`.

<img width="852" height="241" alt="image" src="https://github.com/user-attachments/assets/9601f973-8c09-486a-8fb9-aa29a066a3c0" />
<img width="1545" height="557" alt="image" src="https://github.com/user-attachments/assets/e6884775-0f10-44c0-aae8-e12e7b50d30c" />

After testing, remove the one off Job. The scheduled CronJob remains:

``` powershell
kubectl delete job todo-db-backup-manual -n project
```

The backup object in Cloud Storage is not deleted when the Kubernetes Job is deleted.

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
