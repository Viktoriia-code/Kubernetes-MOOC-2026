# Exercise 2.1 - Connecting pods

## Task
Connect the Log output application and the Ping pong application with HTTP. So, instead of sharing data via files, use an HTTP GET endpoint in the Ping pong app to respond with the number of pongs for the Log output app. Remove the volume between the two applications for the time being.

The response of the HTTP GET to Log output will stay the same:

```text
2020-03-30T12:15:17.705Z: 8523ecb1-c716-4cb6-a044-b9e83bb98e43.
Ping / Pongs: 3
```

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

Apply the Kubernetes manifests from the project directory:

```powershell
kubectl apply -f .\manifests
kubectl apply -f ..\log_output\manifests\ingress.yaml
kubectl rollout status deployment/ping-pong
```

## 3. Testing

Send a GET request to the application through the Ingress:

```powershell
curl.exe http://localhost:8081/pingpong
```

Repeat the request to see the counter increase.

Check the Deployment status:

```powershell
kubectl get deployments
kubectl get pods
```

Check the Service and Ingress:
```powershell
kubectl get service ping-pong-svc
kubectl get ingress
```
