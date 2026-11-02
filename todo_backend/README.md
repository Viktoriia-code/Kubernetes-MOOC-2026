# Exercise 3.11 - The project, step 19

## Task
> Set sensible resource requests and limits for the project. The exact values are not important. Just test what works. You may find the command kubectl top pods useful.

## Resource requests and limits

Each project container defines CPU and memory requests and limits. A request is the amount of resource Kubernetes reserves for scheduling. A limit is the maximum resource the container may use.

CPU values use millicores: `100m` equals one tenth of a CPU core. Memory values use mebibytes: `128Mi` is 128 MiB of memory. CPU usage above the limit is throttled, while a container that exceeds its memory limit may be terminated. Requests are intentionally lower than limits so normal workloads can use additional capacity when it is available.

| Workload | CPU request | Memory request | CPU limit | Memory limit |
|---|---:|---:|---:|---:|
| `todo-app` | 50m | 64Mi | 250m | 256Mi |
| `todo-backend` | 50m | 64Mi | 250m | 256Mi |
| `postgres` | 100m | 128Mi | 500m | 512Mi |
| `todo-reminder` CronJob | 10m | 16Mi | 50m | 64Mi |
| `todo-db-backup` CronJob | 100m | 128Mi | 500m | 512Mi |

The frontend and backend use small requests because they are lightweight Node.js services. PostgreSQL and the backup job receive more memory and CPU for database operations. The reminder job has the smallest values because it only performs a short HTTP request. These values are starting points and can be adjusted after checking actual usage:

```powershell
kubectl top pods -n project
kubectl top nodes
kubectl describe node <node-name> | sed -n '/Allocated resources/,/^$/p'
```

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
</details>