# Exercise 3.4 - Rewritten routing

## Task

After the previous exercise, your ping-pong app now most likely needs to respond to the URL /pingpong to work in the cluster setup.

It would be nice if we were not forced to reflect the cluster-level URL structures in the applications, and instead, the app itself could provide the behavior in the root path /. Thanks to the flexibility of the Gateway API, this can be easily done by route rewriting.

Make this change to your ping-pong app and to the HTTP route!

## Overview

The Ping-pong application responds to HTTP GET requests at `/` by incrementing a counter stored in PostgreSQL. The `/pings` endpoint returns the current counter without incrementing it, allowing the Log output application to read the value.

PostgreSQL runs in a StatefulSet with a PersistentVolumeClaim, allowing the counter to survive Ping-pong Pod restarts.

## Technologies

- Node.js
- PostgreSQL
- Docker
- Kubernetes
- Google Kubernetes Engine (GKE)
- Google Cloud Container Registry

## Application

The application listens on port `3000` inside the container.

The `GET /` endpoint increments the counter and returns the current value:

```text
pong 0
pong 1
pong 2
```

Each request increments the counter by one. The `GET /pings` endpoint returns the current counter without changing it.

## Docker Image

The application image is built and tagged as:

`gcr.io/dwk-gke-513110/ping-pong:3.3`

## Kubernetes Resources

The application runs in a Deployment named `ping-pong`. PostgreSQL runs in a one replica StatefulSet named `postgres`.

The `ping-pong-svc` Service uses the `ClusterIP` type required by Gateway API.
It forwards requests from port `80` to port `3000` in the application container.
The HTTPRoute routes `/pingpong` to this Service and rewrites the path to `/`.

The Gateway API rewrite allows the application to use `/` while users access
the counter through `/pingpong`.

PostgreSQL is accessed through the headless `postgres-svc` Service. Its StatefulSet uses a PersistentVolumeClaim to store database data.

| Resource | Name | Purpose |
|---|---|---|
| Deployment | `ping-pong` | Runs the application |
| StatefulSet | `postgres` | Runs PostgreSQL |
| Service | `ping-pong-svc` | Provides the Ping-pong ClusterIP backend |
| Service | `postgres-svc` | Provides internal database access |
| ConfigMap | `ping-pong-database-config` | Stores database configuration |
| Secret | `pingpong-secret` | Stores the database password |
| PersistentVolumeClaim | Created by the StatefulSet | Stores PostgreSQL data |

## Implementation
## 1. Configure Google Cloud

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

## 2. Build and publish the application image

The Deployment references the image `gcr.io/dwk-gke-513110/ping-pong:3.4`. Replace the project ID in the commands and in [`deployment.yaml`](.\manifests\deployment.yaml) if you are using a different Google Cloud project.

From this directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/ping-pong:3.4 .
```

Configure Docker authentication for Google Container Registry and push the image:

```powershell
gcloud auth configure-docker gcr.io
docker push gcr.io/dwk-gke-513110/ping-pong:3.4
```

Update the `image` field in [`manifests/deployment.yaml`](.\manifests\deployment.yaml) to the same image tag before deploying.

## 3. Deploy to GKE

Apply all manifests:

```powershell
kubectl apply -f .\manifests
```

Wait for PostgreSQL and the Ping-pong Deployment to become ready:

```powershell
kubectl rollout status statefulset/postgres
kubectl rollout status deployment/ping-pong
```

Check the created resources:

```powershell
kubectl get pods,svc,statefulset,pvc
```

## 4. Deploy the Log output application and Gateway API resources

From this point, follow the [Log output README](../log_output/README.md) to
deploy the shared Gateway API resources and access both applications through
the Gateway.

## 5. Troubleshooting

Inspect pod status and recent events:

```powershell
kubectl get pods
kubectl describe pod -l app=ping-pong
kubectl get events --sort-by=.lastTimestamp
```

View application logs:

```powershell
kubectl logs deployment/ping-pong
```

If the Ping-pong pod cannot connect to PostgreSQL, check the StatefulSet and its logs:

```powershell
kubectl get pods -l app=postgres
kubectl logs statefulset/postgres
```

## 6. Avoid unnecessary GKE costs

The GKE Gateway and cluster can incur charges. Delete the cluster when it is no longer needed:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```

Remove the pushed images:
```powershell
$repositories = @(
    "gcr.io/dwk-gke-513110/log-output",
    "gcr.io/dwk-gke-513110/ping-pong"
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
gcloud container images list-tags gcr.io/dwk-gke-513110/ping-pong
```

Deleting the cluster also deletes the deployed Kubernetes resources. When continuing the exercise, recreate the cluster, fetch its credentials, and apply the manifests again.
