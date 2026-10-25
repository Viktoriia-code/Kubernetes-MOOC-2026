# Exercise 1.11 - Persisting data

## Task
Let's share data between "Ping-pong" and "Log output" applications using persistent volumes. Create both a PersistentVolume and PersistentVolumeClaim and alter the Deployment to utilize it. As PersistentVolumes are often maintained by cluster administrators rather than developers and those are not application specific you should keep the definition for those separated, perhaps in own folder.

Save the number of requests to the "Ping-pong" application into a file in the volume and output it with the timestamp and the random string when sending a request to our "Log output" application. In the end, the two pods should share a persistent volume between the two applications. So the browser should display the following when accessing the "Log output" application:

```text
2020-03-30T12:15:17.705Z: 8523ecb1-c716-4cb6-a044-b9e83bb98e43.
Ping / Pongs: 3
```

## Application

The application consists of two containers:

* **`log-output-writer`** generates a UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
* **`log-output-reader`** reads the shared file and returns its contents through HTTP GET requests to `/` and `/status`.

The writer runs `generator.js`, while the reader runs `server.js`.

Both containers share a persistent volume claim mounted at `/usr/src/app/files`. This allows
them to exchange data through a common file, and also shares the volume with Ping-pong.

The reader listens on port `3000` inside the container.

## Technologies

* Node.js
* Docker
* Kubernetes
* k3d
* Ingress

## Docker Image

The image is available on Docker Hub:

[vikikone/log-output](https://hub.docker.com/r/vikikone/log-output)

Image tag: `vikikone/log-output:v1.11`

## Kubernetes Resources

The application is deployed with one replica and two containers in a single Pod.

| Resource | Name | Purpose |
|---|---|---|
| Deployment | `log-output` | Runs the application Pod |
| Container | `log-output-writer` | Generates and writes log entries |
| Container | `log-output-reader` | Serves the shared file over HTTP |
| Service | `log-output-svc` | Exposes port `2345` and forwards requests to port `3000` |
| Ingress | `log-output-ingress` | Routes HTTP requests to the Service |
| PersistentVolume | `shared-storage` | Provides shared storage for both applications |
| PersistentVolumeClaim | `shared-storage-claim` | Mounts the persistent storage in both deployments |

## Request Flow

Requests to the application follow this path:

```text
http://localhost:8081/
        |
        v
Ingress controller, port 80
        |
        v
log-output-ingress
        |
        v
log-output-svc, port 2345
        |
        v
Pod, container port 3000
        |
        v
log-output-reader
        |
        v
Shared file: status.txt
```

## Project Structure

```text
Kubernetes-MOOC-2026/
└── log_output/
    ├── persistent_volumes/
    │   ├── persistentvolume.yaml
    │   └── persistentvolumeclaim.yaml
    ├── manifests/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── ingress.yaml
    └── ...
```

* `generator.js` generates the UUID and writes timestamped entries to the file.
* `server.js` reads the file and returns its contents through HTTP.
* `Dockerfile` builds the Docker image.
* `deployment.yaml` defines the two containers and their shared volume.
* `service.yaml` defines the internal ClusterIP Service.
* `ingress.yaml` defines the HTTP routing rules.

## Requirements

- Docker
- Node.js and npm (only needed for running the application locally)
- `kubectl`
- k3d or another Kubernetes cluster with an Ingress controller

## Implementation steps

### 1. Build the Docker Image

Build the application image with a new tag from the `log_output` directory:

```powershell
docker build -t vikikone/log-output:v1.11 .
```

If the image needs to be uploaded to Docker Hub, push it:

```powershell
docker push vikikone/log-output:v1.11
```

### 2. Create the PersistentVolume

Apply the PersistentVolume manifest from the repository root:

```powershell
kubectl apply -f .\log_output\persistent_volumes\persistentvolume.yaml
```

### 3. Create the PersistentVolumeClaim

The PersistentVolumeClaim is named `shared-storage-claim` and requests storage from the PersistentVolume.

Apply the manifest:

```powershell
kubectl apply -f .\log_output\persistent_volumes\persistentvolumeclaim.yaml
```

Verify the storage resources:

```powershell
kubectl get pv
kubectl get pvc
```

### 4. Deploy the Application

Apply the Kubernetes manifests:

```powershell
kubectl apply -f .\log_output\manifests\
```

Check the Deployment and Pods:

```powershell
kubectl get deployments
kubectl get pods
```

The Deployment is named `log-output-dep`.

### 5. Verify Persisted Data

The application uses two containers in the same Pod:

- **Writer:** generates data and writes it to files.
- **Reader:** reads the stored files.

Both containers mount the same PVC so they can access the same files.

Read the counter file from the reader container:

```powershell
kubectl exec deployment/log-output-dep -c log-output-reader -- cat /usr/src/app/files/count.txt
```

Run the command again after a short wait. The count should change as the writer updates the file.

List the files in the shared storage directory:

```powershell
kubectl exec deployment/log-output-dep -c log-output-reader -- ls -l /usr/src/app/files
```

### 6. Test the application

Send an HTTP GET request to the root endpoint:

```powershell
curl.exe http://localhost:8081/
```

Test the status endpoint:

```powershell
curl.exe http://localhost:8081/status
```

Both endpoints should return the contents of the shared file, including timestamps and the UUID generated at startup.

The timestamp should change every five seconds, while the UUID should remain the same during the lifetime of the writer container.

### 7. Stop and restart the application

To stop the application while keeping the Kubernetes resources, scale the
Deployment down to zero replicas:

```bash
kubectl scale deployment/log-output --replicas=0
```

To start the application again, scale it back to one replica:

```bash
kubectl scale deployment/log-output --replicas=1
kubectl rollout status deployment/log-output
```

The application uses the `shared-storage-claim` PVC. Its contents remain available when
either application pod is recreated. The Ping-pong request count and Log output status
file are stored in the same persistent volume.