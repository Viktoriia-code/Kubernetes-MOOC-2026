# Exercise 3.4 - Rewritten routing

## Task

After the previous exercise, your ping-pong app now most likely needs to respond to the URL /pingpong to work in the cluster setup.

It would be nice if we were not forced to reflect the cluster-level URL structures in the applications, and instead, the app itself could provide the behavior in the root path /. Thanks to the flexibility of the Gateway API, this can be easily done by route rewriting.

Make this change to your ping-pong app and to the HTTP route!

## Application

The Log output application consists of two containers in one Pod:

* `log-output-writer` generates a UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
* `log-output-reader` reads the shared file and serves the contents through `GET /` and `GET /status`.

Both containers share an `emptyDir` volume mounted at `/usr/src/app/files`. The reader listens on port `3000` inside the container. The Kubernetes Service exposes that container through port `2345`.

When the reader serves `/` or `/status`, it also requests `http://ping-pong-svc.exercises:80/pings`. The `/pings` endpoint returns the current Ping-pong counter without incrementing it.

The HTTPRoute routes and rewrites:

* `/` and `/status` to the Log output application
* `/pingpong` to the Ping-pong application as `/`

The Gateway rewrites `/pingpong` to `/`, so the Ping-pong application only needs to implement its counter endpoint at `/`.

The response includes the ConfigMap values, the generated status file, and the Ping-pong count:

```text
file content: this text is from file
env variable: MESSAGE=hello world
2026-05-18T12:15:17.705Z: 8523ecb1-c716-4cb6-a044-b9e83bb98e43.
Ping / Pongs: 3
```

## Kubernetes resources

The manifests in [`manifests/`](.\manifests) create:

* `log-output-dep`, a one-replica Deployment with writer and reader containers
* `log-output-svc`, an internal ClusterIP Service on port `2345`
* `log-output-config`, a ConfigMap containing `information.txt` and `MESSAGE`
* `my-gateway`, the GKE Gateway resource
* `my-route`, the HTTPRoute for Log output and Ping-pong

The Ping-pong manifests must also be deployed in the `exercises` namespace.
The Ping-pong Service is a `ClusterIP` backend for the Gateway and exposes Service port `80`.

## Request flow

```text
http://GATEWAY_IP/
        |
        v
GKE Gateway
        |
        v
log-output-svc:2345
        |
        v
log-output-reader:3000
        |
        +--> ping-pong-svc:80/pings

http://GATEWAY_IP/pingpong
        |
        v
GKE Gateway
        |
        v
ping-pong-svc:80
        |
        v
ping-pong:3000
```

## Project structure

```text
Kubernetes-MOOC-2026/
└── log_output/
    ├── manifests/
    │   ├── configmap.yaml
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   ├── gateway.yaml
    │   └── route.yaml
    ├── Dockerfile
    ├── generator.js
    ├── server.js
    └── package.json
```

## Requirements

* A Google Cloud project with billing enabled or available credits
* Google Cloud SDK (`gcloud`)
* `kubectl`
* Docker
* A GKE cluster with Gateway API enabled

## 1. Configure Google Cloud

Follow the Google Cloud setup instructions in the [Ping-pong README](../ping_pong/README.md), then return here to continue with the Gateway API setup.

In order to use the Gateway API, run the command in order to enable it to the cluster:
```powershell
gcloud container clusters update dwk-cluster --location=europe-north1-b --gateway-api=standard
```

Verify the configuration:
```powershell
gcloud container clusters describe dwk-cluster --zone=europe-north1-b --project=dwk-gke-513110 --format="yaml(networkConfig.gatewayApiConfig)"
```
Expected:
```
gatewayApiConfig:
  channel: CHANNEL_STANDARD
```
## 2. Deploy Ping-pong

Deploy Ping-pong before Log output because the reader requests the Ping-pong
Service when serving `/` and `/status`.

Follow the deployment instructions in the [Ping-pong README](../ping_pong/README.md), then return here to deploy Log output and the shared Gateway API resources.

## 3. Build and publish the Log output image

From this directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/log-output:v3.4 .
```

Push it to Docker Hub if the image is not already available there:

```powershell
docker push gcr.io/dwk-gke-513110/log-output:v3.4
```

If you use a different registry or tag, update the image fields for both
containers in [`manifests/deployment.yaml`](.\manifests\deployment.yaml).

## 4. Deploy Log output and the Gateway API resources

From the repository root, apply the Log output manifests to the same namespace:

```powershell
kubectl apply -f .\manifests
kubectl rollout status deployment/log-output-dep
```

Check all resources:

```powershell
kubectl get pods,svc,deployments,gateway,httproute
```

GKE needs some time to provision the external Gateway address. Watch it until the `ADDRESS` column is populated:

```powershell
kubectl get gateway my-gateway --watch
```

## 5. Test the applications through Gateway API

Get the external Gateway address:

```powershell
kubectl get gateway my-gateway
```

Test Log output:

```powershell
curl.exe "http://$GATEWAY_IP/"
curl.exe "http://$GATEWAY_IP/status"
```

Test Ping-pong:

```powershell
curl.exe "http://$GATEWAY_IP/pingpong"
```

The Ping-pong counter should increase between requests. The Log output response should include the current counter without incrementing it.

## 6. Verify the shared status file

Read the status file from the reader container:

```powershell
kubectl exec deployment/log-output-dep -c log-output-reader -- cat /usr/src/app/files/status.txt
```

Run the command again after a few seconds. A new timestamped line should appear, while the UUID remains the same for the lifetime of the writer container.

List the shared volume:

```powershell
kubectl exec deployment/log-output-dep -c log-output-reader -- ls -l /usr/src/app/files
```

## 7. Troubleshooting

Inspect the Gateway, HTTPRoute, Services, Pods, and recent events:

```powershell
kubectl describe gateway my-gateway
kubectl describe httproute my-route
kubectl get svc
kubectl get pods
kubectl get events --sort-by=.lastTimestamp
```

View Log output logs:

```powershell
kubectl logs deployment/log-output-dep -c log-output-reader
kubectl logs deployment/log-output-dep -c log-output-writer
```

If the reader cannot contact Ping-pong, check the Ping-pong Service and Pod:

```powershell
kubectl get endpoints ping-pong-svc
kubectl get pods -l app=ping-pong
kubectl logs deployment/ping-pong
```

## 8. Stop and restart Log output

To stop Log output while keeping its Kubernetes resources:

```powershell
kubectl scale deployment/log-output-dep --replicas=0
```

Restart it with:

```powershell
kubectl scale deployment/log-output-dep --replicas=1
kubectl rollout status deployment/log-output-dep
```

## 9. Avoid unnecessary GKE costs

The GKE Gateway and cluster can incur charges. Delete the cluster when it is no longer needed:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```

Deleting the cluster also deletes the deployed Kubernetes resources. When continuing the exercise, recreate the cluster, fetch its credentials, and apply the manifests again.
