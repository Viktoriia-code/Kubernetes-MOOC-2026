# Exercise 3.2 - Back to Ingress

## Task

Deploy the "Log output" and "Ping-pong" applications into GKE and expose it with Ingress.

"Ping-pong" will have to respond from /pingpong path. This may require you to rewrite parts of the code.

Note that Ingress expects a service to give a successful response in the path / even if the service is mapped to some other path!

## Application

The Log output application consists of two containers in one Pod:

* `log-output-writer` generates a UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
* `log-output-reader` reads the shared file and serves the contents through `GET /` and `GET /status`.

Both containers share an `emptyDir` volume mounted at `/usr/src/app/files`. The reader listens on port `3000` inside the container. The Kubernetes Service exposes that container through port `2345`.

When the reader serves `/` or `/status`, it also requests `http://ping-pong-svc.exercises:80/pings`. The `/pings` endpoint returns the current Ping-pong counter without incrementing it.

The Ingress routes:

* `/` and `/status` to the Log output application
* `/pingpong` to the Ping-pong application

GKE Ingress health checks request `/` from each backend. The Ping-pong application therefore returns HTTP 200 from `/`, while `/pingpong` remains the counter endpoint used by the exercise.

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
* `log-output-ingress`, the GKE Ingress resource

The Ping-pong manifests must also be deployed in the `exercises` namespace.
The Ping-pong Service is a `NodePort` backend for the Ingress and exposes Service port `80`.

## Request flow

```text
http://INGRESS_IP/
        |
        v
GKE Ingress
        |
        v
log-output-svc:2345
        |
        v
log-output-reader:3000
        |
        +--> ping-pong-svc:80/pings

http://INGRESS_IP/pingpong
        |
        v
GKE Ingress
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
    │   └── ingress.yaml
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
* A GKE cluster with an Ingress controller

## 1. Configure Google Cloud

Log in and select the Google Cloud project used for the exercise:

```powershell
gcloud auth login
gcloud config set project dwk-gke-513110
gcloud services enable container.googleapis.com
```

Create a cluster if you do not already have one:

```powershell
gcloud container clusters create dwk-cluster --zone=europe-north1-b --cluster-version=1.36 --disk-size=32 --num-nodes=4 --machine-type=e2-small
```

Configure `kubectl` to use the cluster:

```powershell
gcloud container clusters get-credentials dwk-cluster --zone=europe-north1-b
kubectl cluster-info
```

If `kubectl` reports that the GKE authentication plugin is missing, install the [`gke-gcloud-auth-plugin`](https://cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl#install_plugin) and fetch the cluster credentials again.


## 2. Deploy Ping-pong

Deploy Ping-pong before Log output because the reader requests the Ping-pong
Service when serving `/` and `/status`.

Follow the deployment instructions in the [Ping-pong README](../ping_pong/README.md), then return here to deploy Log output and the shared Ingress.

## 3. Build and publish the Log output image

From this directory, build the image:

```powershell
docker build -t gcr.io/dwk-gke-513110/log-output:v3.2 .
```

Push it to Docker Hub if the image is not already available there:

```powershell
docker push gcr.io/dwk-gke-513110/log-output:v3.2
```

If you use a different registry or tag, update the image fields for both
containers in [`manifests/deployment.yaml`](.\manifests\deployment.yaml).

## 4. Deploy Log output and the Ingress

From the repository root, apply the Log output manifests to the same namespace:

```powershell
kubectl apply -f .\manifests
kubectl rollout status deployment/log-output-dep
```

Check all resources:

```powershell
kubectl get pods,svc,deployments,ingress
```

GKE needs some time to provision the external Ingress address. Watch it until the `ADDRESS` column is populated:

```powershell
kubectl get ingress log-output-ingress --watch
```

## 5. Test the applications through Ingress

Get the external Ingress address:

```powershell
kubectl get ingress log-output-ingress
```

Test Log output:

```powershell
curl.exe "http://$INGRESS_IP/"
curl.exe "http://$INGRESS_IP/status"
```

Test Ping-pong:

```powershell
curl.exe "http://$INGRESS_IP/pingpong"
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

Inspect the Ingress, Services, Pods, and recent events:

```powershell
kubectl describe ingress log-output-ingress
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

The GKE Ingress and cluster can incur charges. Delete the cluster when it is
no longer needed:

```powershell
gcloud container clusters delete dwk-cluster --zone=europe-north1-b
```

Deleting the cluster also deletes the deployed Kubernetes resources. When continuing the exercise, recreate the cluster, fetch its credentials, and apply the manifests again.
