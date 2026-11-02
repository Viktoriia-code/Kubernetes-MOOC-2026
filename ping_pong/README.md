# Exercise 4.1 - Readines probe

## Task
> Create a ReadinessProbe for the Ping-pong application. It should be ready when it has a connection to the database.
> 
> And another ReadinessProbe for Log output application. It should be ready when it can receive data from the Ping-pong application.
> 
> Test that it works by applying everything but the database statefulset. The output of kubectl get po should look like this before the database is available:
> 
> ```text
> NAME                             READY   STATUS    RESTARTS   AGE
> logoutput-dep-7f49547cf4-ttj4f   1/2     Running   0          21s
> pingpong-dep-9b698d6fb-jdgq9     0/1     Running   0          21s
> ```
> 
> Adding the database should automatically move the READY states to 2/2 and 1/1 for Log output and Ping-pong respectively.

## Readiness probe implementation

Readiness probes were added to the Kubernetes Deployment manifests:

- [`ping_pong/manifests/deployment.yaml`](./manifests/deployment.yaml) checks `/pings` on the Ping-pong container. The endpoint succeeds only when PostgreSQL is available.

The following configuration was added to the Ping-pong container:

```yaml
readinessProbe:
  httpGet:
    path: /pings
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

As a result, Kubernetes adds the Ping-pong pod to the Service endpoints only after PostgreSQL is available.

After PostgreSQL is available, check the Ping-pong readiness status:

```powershell
kubectl get pods
kubectl describe pod <pod-name>
kubectl get endpoints ping-pong-svc
```

The Ping-pong pod should show `1/1` in the `READY` column, and
`ping-pong-svc` should have an endpoint. Screenshots of these results are added below:

<img width="854" height="289" alt="image" src="https://github.com/user-attachments/assets/bfc1f4e4-11e2-4428-b2be-cdbc54c62c01" />

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

`gcr.io/dwk-gke-513110/ping-pong:4.1`

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

<details>
<summary>1. Configure Google Cloud</summary>

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
<summary>2. Build and publish the application image</summary>

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
</details>

<details>
<summary>3. Deploy to GKE</summary>

Apply all manifests:

```powershell
kubectl apply -f .\manifests
```

Wait for PostgreSQL and the Ping-pong Deployment to become ready:

```powershell
kubectl rollout status statefulset/postgres
kubectl rollout status deployment/ping-pong
```

Check the readiness state:

```powershell
kubectl get pods
```

Check the created resources:

```powershell
kubectl get pods,svc,statefulset,pvc
```
</details>

<details>
<summary>4. Deploy the Log output application and Gateway API resources</summary>

From this point, follow the [Log output README](../log_output/README.md) to
deploy the shared Gateway API resources and access both applications through the Gateway.
</details>

<details>
<summary>5. Troubleshooting</summary>

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
</details>

<details>
<summary>6. Avoid unnecessary GKE costs</summary>

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
</details>
