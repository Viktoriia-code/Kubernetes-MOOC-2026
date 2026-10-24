# Exercise 1.10 - Even more services (Two containers and shared storage)

## Task
Split the "Log output" application into two different containers within a single pod:

- One generates a random string on startup and writes a line with the random string and timestamp every 5 seconds into a file.
- The other reads that file and provides the content in the HTTP GET endpoint for the user to see

You may find [this](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/) helpful now since there are more than one container running inside a pod.

## What was done

This application:

- The `log-output-writer` container generates one UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
- The `log-output-reader` container reads the shared file and serves its contents over HTTP at `/` and `/status`.
- The writer runs [`generator.js`](./generator.js), while the reader runs [`server.js`](./server.js).
- Uses a shared `emptyDir` volume to exchange data between both containers in the same Pod.
- The reader listens on port `3000` inside the container.
- Is deployed to Kubernetes with one replica and two containers in a single Pod.
- Uses the `log-output-svc` ClusterIP Service to forward port `2345` to the reader container's port `3000`.
- Uses the `log-output-ingress` Ingress to route HTTP traffic from `/` to the Service.

## Application

The application consists of two containers:

* **`log-output-writer`** generates a UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
* **`log-output-reader`** reads the shared file and returns its contents through HTTP GET requests to `/` and `/status`.

The writer runs `generator.js`, while the reader runs `server.js`.

Both containers share an `emptyDir` volume mounted at `/usr/src/app/files`. This allows them to exchange data through a common file.

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

Image tag: `vikikone/log-output:v1.10`

## Kubernetes Resources

The application is deployed with one replica and two containers in a single Pod.

| Resource | Name | Purpose |
|---|---|---|
| Deployment | `log-output` | Runs the application Pod |
| Container | `log-output-writer` | Generates and writes log entries |
| Container | `log-output-reader` | Serves the shared file over HTTP |
| Service | `log-output-svc` | Exposes port `2345` and forwards requests to port `3000` |
| Ingress | `log-output-ingress` | Routes HTTP requests to the Service |
| Volume | `log-file` | Shares the log file between containers |

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

The Kubernetes resources are defined in the `manifests` folder.

```text
log_output/
├── generator.js
├── server.js
├── Dockerfile
├── package.json
├── package-lock.json
├── README.md
└── manifests/
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
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

### 1. Create or select a k3d cluster

For a new cluster, map the host port `8081` to the Ingress controller's port
`80`:

```bash
k3d cluster create k3s-default --agents 2 -p "8081:80@loadbalancer"
kubectl config use-context k3d-k3s-default
```

If the cluster already exists, select it instead:

```bash
kubectl config use-context k3d-k3s-default
```

### 2. Build and push the Docker image

Build the image:

```powershell
docker build -t vikikone/log-output:v1.10 .
```

Push it to Docker Hub:

```powershell
docker push vikikone/log-output:v1.10
```

### 3. Apply all Kubernetes resources

Apply the Deployment, Service, and Ingress resources from the project directory:

```bash
kubectl apply -f manifests
```

### 4. Check the deployment

Wait for the Deployment to become ready:

```powershell
kubectl rollout status deployment/log-output
```

Check the Deployments, Pods, Services, and Ingress resources:

```powershell
kubectl get deployments,pods
kubectl get svc,ingress
```

The Log output Pod should show `2/2` containers ready.

### 5. Inspect container logs

View the writer container logs:

```powershell
kubectl logs -f deployment/log-output -c log-output-writer
```

In a separate PowerShell window, view the reader container logs:

```powershell
kubectl logs -f deployment/log-output -c log-output-reader
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

The application uses an `emptyDir` volume. Its contents remain available while the Pod exists, but are lost when the Pod is deleted. A newly created Pod receives a new volume, and the writer generates a new UUID and starts a new log file.