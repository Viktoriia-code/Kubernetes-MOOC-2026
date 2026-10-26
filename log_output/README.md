# Exercise 2.5 - Documentation and ConfigMaps

## Task
Use the official Kubernetes documentation for this exercise. The following

https://kubernetes.io/docs/concepts/configuration/configmap/ and
https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/
should contain everything you need.

Create a ConfigMap for the "Log output" application. The ConfigMap should define one file information.txt and one env variable MESSAGE.

The app should map the file as a volume, set the environment variable and print the content of those in addition to the usual output:

```text
file content: this text is from file
env variable: MESSAGE=hello world
2026-05-18T12:15:17.705Z: 8523ecb1-c716-4cb6-a044-b9e83bb98e43.
Ping / Pongs: 3
```

## Application

The application consists of two containers:

* **`log-output-writer`** generates a UUID at startup and appends a timestamp and the UUID to `/usr/src/app/files/status.txt` every five seconds.
* **`log-output-reader`** reads the shared file and returns its contents through HTTP GET requests to `/` and `/status`.

The writer runs `generator.js`, while the reader runs `server.js`.

Both containers share an `emptyDir` mounted at `/usr/src/app/files` for the status file. The volume is local to the Log output pod and is not shared with Ping-pong.

The reader listens on port `3000` inside the container.

Both (log_output and ping_pong) applications run in the `exercises` namespace. When the reader serves `/` or `/status`, it reads `status.txt` and makes an HTTP GET request to the Ping-pong Service at `http://ping-pong-svc.exercises:3005/pings`. The `/pings` endpoint returns the current counter without incrementing it, while the browser-facing `/pingpong` endpoint increments the counter.

The `log-output-config` ConfigMap provides the reader with the `information.txt` file and the `MESSAGE` environment variable. The response includes both values before the timestamp and Ping-pong count.

## Technologies

* Node.js
* Docker
* Kubernetes
* k3d
* Ingress
* kubens

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
Log output status file
        |
        +--> http://ping-pong-svc.exercises:3005/pings
```

## Project Structure

```text
Kubernetes-MOOC-2026/
└── log_output/
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
docker build -t vikikone/log-output:v2.5 .
```

If the image needs to be uploaded to Docker Hub, push it:

```powershell
docker push vikikone/log-output:v2.5
```

### 2. Deploy the Application

Create the namespace with kubectl:

```powershell
kubectl create namespace exercises
```

Then apply the Kubernetes manifests:

```powershell
kubectl apply -f .\manifests
```

Check the Deployment and Pods:

```powershell
kubectl get deployments -n exercises
kubectl get pods -n exercises
```

The Deployment is named `log-output-dep`.

### 3. Verify Persisted Data

The application uses two containers in the same Pod:

- **Writer:** generates data and writes it to files.
- **Reader:** reads the stored files.

Both containers mount the same `emptyDir` so they can access the status file.

Read the status file from the reader container:

```powershell
kubectl exec -n exercises deployment/log-output-dep -c log-output-reader -- cat /usr/src/app/files/status.txt
```

Run the command again after a short wait. A new timestamped line should appear.

List the files in the shared storage directory:

```powershell
kubectl exec -n exercises deployment/log-output-dep -c log-output-reader -- ls -l /usr/src/app/files
```

### 4. Test the application

Send an HTTP GET request to the root endpoint:

```powershell
curl.exe http://localhost:8081/
```

Test the status endpoint:

```powershell
curl.exe http://localhost:8081/status
```

Both endpoints should return the contents of the shared file, including timestamps and the UUID generated at startup.

The response also includes:

```text
file content: this text is from file
env variable: MESSAGE=hello world
```

The timestamp should change every five seconds, while the UUID should remain the same during the lifetime of the writer container.

### 5. Stop and restart the application

To stop the application while keeping the Kubernetes resources, scale the
Deployment down to zero replicas:

```bash
kubectl scale deployment/log-output-dep --replicas=0 -n exercises
```

To start the application again, scale it back to one replica:

```bash
kubectl scale deployment/log-output-dep --replicas=1 -n exercises
kubectl rollout status deployment/log-output-dep -n exercises
```
