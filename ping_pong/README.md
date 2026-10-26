# Exercise 2.7 - Stateful applications

## Task
Run a Postgres database as a stateful set (with one replica) and save the Ping-pong application counter into the database.

## Overview
The application responds to HTTP GET requests at `/pingpong` using a counter stored in PostgreSQL. The `/pings` endpoint returns the current counter without incrementing it, for use by Log output. The counter survives Ping-pong pod restarts because PostgreSQL uses a StatefulSet with a persistent volume claim.

## Technologies

* Node.js
* PostgreSQL
* Docker
* Kubernetes
* k3d
* Ingress

## Application

The application listens on port `3000` inside the container.

The application responds to `GET /pingpong` with a persistent request counter:

```text
pong 0
pong 1
...
```

Each request increases the counter by one.

## Docker Image

The application image is available on Docker Hub:

`vikikone/ping-pong:v2.7`

## Kubernetes Resources

The application runs in a Kubernetes Deployment named `ping-pong`. PostgreSQL
runs in a one-replica StatefulSet named `postgres`.

The Service `ping-pong-svc` exposes port `3005` and forwards requests to port `3000` in the application container.

The application shares an Ingress resource with the Log output application.

The PostgreSQL StatefulSet uses the headless `postgres-svc` Service and a `volumeClaimTemplates` entry with the `local-path` storage class.

| Path | Service | Service port |
|---|---|---:|
| `/` | `log-output-svc` | `2345` |
| `/pingpong` | `ping-pong-svc` | `3005` |

## Implementation steps

### 1. Build the Docker Image

Build the application image with a new tag from the `ping_pong` directory:

```powershell
docker build -t vikikone/ping-pong:v2.7 .
```

If the image needs to be uploaded to Docker Hub, push it:

```powershell
docker push vikikone/ping-pong:v2.7
```

### 2. Deploy the Application

Create the namespace with kubectl (if it doesn't exist):

```powershell
kubectl create namespace exercises
```

Apply the Kubernetes manifests from the project directory:

```powershell
kubectl apply -f .\manifests
kubectl rollout status statefulset/postgres -n exercises
kubectl rollout status deployment/ping-pong -n exercises
```

The manifests create the PostgreSQL Secret, database ConfigMap, headless Service, one-replica StatefulSet, and Ping-pong Deployment. The StatefulSet creates its persistent volume claim automatically through `volumeClaimTemplates`.

## 3. Testing

Send a GET request to the application through the Ingress:

```powershell
curl.exe http://localhost:8081/pingpong
```

Repeat the request to see the counter increase.

Check the Deployment status:

```powershell
kubectl get deployments -n exercises
kubectl get pods -n exercises
kubectl get statefulset,pvc -n exercises
```

Check the Service and Ingress:
```powershell
kubectl get service ping-pong-svc -n exercises
kubectl get ingress -n exercises
```
