# Exercise 4.2 - The project, step 21

## Task
> Create the required probes and endpoint for The Project to ensure that it's working and connected to a database.

## Health probes and application recovery

The backend exposes `GET /healthz`, which runs `SELECT 1` against PostgreSQL:

- PostgreSQL is available: the endpoint returns `200` with `{"status":"ok"}`.
- PostgreSQL is unavailable: the endpoint returns `500` with `{"status":"unhealthy"}`.

The backend deployment uses this endpoint for its Kubernetes readiness probe:

- The **readiness probe** prevents traffic from reaching the backend while PostgreSQL is unavailable.

There is no liveness probe because `/healthz` depends on PostgreSQL. A temporary database outage therefore makes the backend unready without unnecessarily restarting the backend pod. A separate liveness endpoint that checks only whether the process is running could be added if liveness monitoring is required.

## GKE application logs

The monitoring and logging services provided by GKE were used to find the application logs. The backend service was forwarded locally and a new todo was created:

```powershell
kubectl port-forward service/todo-backend-svc 8082:2345 -n project
```

In another PowerShell window:

```powershell
$body = @{ content = "Check GKE application logs" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:8082/todos" `
  -Method Post -ContentType "application/json" -Body $body
```

<img width="962" height="212" alt="image" src="https://github.com/user-attachments/assets/38899bcc-1572-49c6-9cf0-ca2bdc957553" />

**Google Cloud Console > Logging > Logs Explorer** was then opened and the logs were filtered with:

```text
resource.type="k8s_container"
resource.labels.namespace_name="project"
resource.labels.container_name="todo-backend"
textPayload:"Todo created:"
```

The log entry confirmed that the todo was created successfully:

```text
Todo created: {"id":5,"content":"Check GKE application logs"}
```
<img width="1550" height="765" alt="image" src="https://github.com/user-attachments/assets/2b9c8408-db6e-482e-816b-d3ec825d7cb1" />

## Application
The Todo backend is a Node.js HTTP service used by the project frontend. It provides a small JSON API for reading and creating todo items. Todo data is stored in PostgreSQL instead of in application memory. The project frontend renders URLs in todo content as clickable links.

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
