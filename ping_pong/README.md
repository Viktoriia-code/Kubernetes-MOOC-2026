# Exercise 3.1 - Pingpong GKE

## Task

Deploy the Ping-pong application to Google Kubernetes Engine (GKE).
The application must be exposed with a Kubernetes `LoadBalancer` Service.

## Overview

The Ping-pong application responds to HTTP GET requests at `/pingpong` by incrementing a counter stored in PostgreSQL. The `/pings` endpoint returns the current counter without incrementing it, allowing the Log output application to read the value.

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

The `GET /pingpong` endpoint increments the counter and returns the current value:

```text
pong 0
pong 1
pong 2
```

Each request increments the counter by one. The `GET /pings` endpoint returns the current counter without changing it.

## Docker Image

The application image is built and tagged as:

`gcr.io/dwk-gke-513110/ping-pong:3.1`

## Kubernetes Resources

The application runs in a Deployment named `ping-pong`. PostgreSQL runs in a one replica StatefulSet named `postgres`.

The `ping-pong-svc` Service uses the `LoadBalancer` type to expose the application through an external IP address. It forwards requests from port `80` to port `3000` in the application container.

PostgreSQL is accessed through the headless `postgres-svc` Service. Its StatefulSet uses a PersistentVolumeClaim to store database data.

| Resource | Name | Purpose |
|---|---|---|
| Deployment | `ping-pong` | Runs the application |
| StatefulSet | `postgres` | Runs PostgreSQL |
| Service | `ping-pong-svc` | Exposes the application externally |
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
gcloud container clusters create dwk-cluster `
  --zone=europe-north1-b `
  --cluster-version=1.36 `
  --disk-size=32 `
  --num-nodes=4 `
  --machine-type=e2-small
```

Configure `kubectl` to use the cluster:

```powershell
gcloud container clusters get-credentials dwk-cluster --zone=europe-north1-b
kubectl cluster-info
```

## 2. Build and publish the application image

The Deployment references the image `gcr.io/dwk-gke-513110/ping-pong:3.1`. Replace the project ID in the commands and in [`deployment.yaml`](.\manifests\deployment.yaml) if you are using a different Google Cloud project.

From this directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/ping-pong:3.1 .
```

Configure Docker authentication for Google Container Registry and push the image:

```powershell
gcloud auth configure-docker gcr.io
docker push gcr.io/dwk-gke-513110/ping-pong:3.1
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

## 4. Access the application through the LoadBalancer

GKE needs some time to provision the external load balancer. Watch the Service until the `EXTERNAL-IP` changes from `<pending>` to an IP address:

```powershell
kubectl get service ping-pong-svc --watch
```

Store the assigned IP in a PowerShell variable and call the application:

```powershell
$EXTERNAL_IP = kubectl get service ping-pong-svc `
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
curl.exe "http://$EXTERNAL_IP/pingpong"
```

The response should look similar to:

```text
pong 0
```

<img width="546" height="131" alt="Screenshot 2026-10-29 141253 confidencial" src="https://github.com/user-attachments/assets/acacd20a-7a1e-466d-b035-84f618393b5d" />

Call the endpoint again to verify that the counter increases:

```powershell
curl.exe "http://$EXTERNAL_IP/pingpong"
curl.exe "http://$EXTERNAL_IP/pings"
```

The `/pings` request reports the current value without incrementing it.

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

If the Ping-pong pod cannot connect to PostgreSQL, check the StatefulSet and
its logs:

```powershell
kubectl get pods -l app=postgres
kubectl logs statefulset/postgres
```

## 6. Avoid unnecessary GKE costs

A `LoadBalancer` Service and the GKE cluster can incur charges. Delete the
cluster when it is no longer needed:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```

Remove the pushed images:
```powershell
gcloud container images list-tags gcr.io/dwk-gke-513110/ping-pong --format="value(digest)" | ForEach-Object { gcloud container images delete "gcr.io/dwk-gke-513110/ping-pong@sha256:$_" --quiet --force-delete-tags }
```

Check that there is no images:
```powershell
gcloud container images list-tags gcr.io/dwk-gke-513110/ping-pong
```

Deleting the cluster also deletes the deployed Kubernetes resources. When
continuing the exercise, recreate the cluster, fetch its credentials, and
apply the manifests again.
