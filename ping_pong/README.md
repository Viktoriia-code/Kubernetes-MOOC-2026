# Exercise 1.11. - Persisting data

## Task
Let's share data between "Ping-pong" and "Log output" applications using persistent volumes. Create both a PersistentVolume and PersistentVolumeClaim and alter the Deployment to utilize it. As PersistentVolumes are often maintained by cluster administrators rather than developers and those are not application specific you should keep the definition for those separated, perhaps in own folder.

Save the number of requests to the "Ping-pong" application into a file in the volume and output it with the timestamp and the random string when sending a request to our "Log output" application. In the end, the two pods should share a persistent volume between the two applications. So the browser should display the following when accessing the "Log output" application:

```text
2020-03-30T12:15:17.705Z: 8523ecb1-c716-4cb6-a044-b9e83bb98e43.
Ping / Pongs: 3
```

## Overview
The application responds to HTTP GET requests at `/pingpong` with a message containing a counter. The counter increases by one for each request and is stored in `/usr/src/app/files/count.txt` on the shared persistent volume.

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

`vikikone/ping-pong:v1.11`

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

The counter is stored in the shared persistent volume and is available to both the Ping-pong
and Log output pods.

## Persistent storage

Apply the persistent volume resources before the application deployments:

```powershell
kubectl apply -f ..\log_output\persistent_volumes\persistentvolume.yaml
kubectl apply -f ..\log_output\persistent_volumes\persistentvolumeclaim.yaml
kubectl apply -f manifests
```

The `ping-pong` deployment and the Log output deployment both mount the
`shared-storage-claim` PVC at `/usr/src/app/files`.
