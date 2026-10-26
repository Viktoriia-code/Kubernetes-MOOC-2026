# Exercise 2.3 - Keep them separated

## Task
Create a namespace called exercises for the applications in the exercises. Move the "Log output" and "Ping-pong" to that namespace and use that in the future for all of the exercises, except the project that shall have a separate namespace. You can follow the course material using the default namespace.
## Overview
The application responds to HTTP GET requests at `/pingpong` with an in-memory
counter. The counter resets when the pod restarts. The `/pings` endpoint
returns the current counter without incrementing it, for use by Log output.

## Technologies

* Node.js
* Express
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

`vikikone/ping-pong:v2.1`

## Kubernetes Resources

The application runs in a Kubernetes Deployment named `ping-pong`.

The Service `ping-pong-svc` exposes port `3005` and forwards requests to port `3000` in the application container.

The application shares an Ingress resource with the Log output application.

| Path | Service | Service port |
|---|---|---:|
| `/` | `log-output-svc` | `2345` |
| `/pingpong` | `ping-pong-svc` | `3005` |

## Implementation steps

### 1. Build the Docker Image

Build the application image with a new tag from the `ping_pong` directory:

```powershell
docker build -t vikikone/ping-pong:v2.1 .
```

If the image needs to be uploaded to Docker Hub, push it:

```powershell
docker push vikikone/ping-pong:v2.1
```

### 2. Deploy the Application

Create the namespace with kubectl (if it doesn't exist):

```powershell
kubectl create namespace exercises
```

Apply the Kubernetes manifests from the project directory:

```powershell
kubectl apply -f .\manifests
kubectl rollout status deployment/ping-pong -n exercises
```

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
```

Check the Service and Ingress:
```powershell
kubectl get service ping-pong-svc -n exercises
kubectl get ingress -n exercises
```
