# Exercise 1.9. - More services (Ping-pong application)

## Task
Develop a second application that simply responds with "pong 0" to a GET request and increases a counter (the 0) so that you can see how many requests have been sent. The counter should be in memory so it may reset at some point. Create a new deployment for it and have it share ingress with "Log output" application. Route requests directed '/pingpong' to it.

In future exercises, this second application will be referred to as "ping-pong application". It will be used with "Log output" application.

The ping-pong application will need to listen to requests on '/pingpong', so you may have to make changes to its code. This can be avoided by configuring the Ingress to rewrite the path, but we will leave that as an optional exercise. You can check out https://kubernetes.io/docs/concepts/services-networking/ingress/#the-ingress-resource(opens in a new tab)

## Overview
The application responds to HTTP GET requests at `/pingpong` with a message containing a counter. The counter starts at `0` and increases by one for each request. The counter is stored in memory and may reset when the application restarts.

## Technologies

* Node.js
* Express
* Docker
* Kubernetes
* k3d
* Ingress

## Application

The application listens on port `3000` inside the container.

The application responds to `GET /pingpong` with an in-memory request counter:

```text
pong 0
pong 1
...
```

Each request increases the counter by one.

## Docker Image

The application image is available on Docker Hub:

`vikikone/ping-pong:v1.0`

## Kubernetes Resources

The application runs in a Kubernetes Deployment named `ping-pong`.

The Service `ping-pong-svc` exposes port `3005` and forwards requests to port `3000` in the application container.

The application shares an Ingress resource with the Log output application.

| Path | Service | Service port |
|---|---|---:|
| `/` | `log-output-svc` | `2345` |
| `/pingpong` | `ping-pong-svc` | `3005` |

## Deployment

Apply the Kubernetes manifests from the project directory:

    kubectl apply -f manifests/deployment.yaml
    kubectl apply -f manifests/service.yaml
    kubectl apply -f ..\log_output\manifests\ingress.yaml

## Testing

Send a GET request to the application through the Ingress:

    curl.exe http://localhost:8081/pingpong

Repeat the request to see the counter increase.

Check the Deployment status:

    kubectl get deployments
    kubectl get pods

Check the Service and Ingress:

    kubectl get service ping-pong-svc
    kubectl get ingress

## Notes

The counter is stored in application memory. It is not persistent and may reset if the application restarts.
