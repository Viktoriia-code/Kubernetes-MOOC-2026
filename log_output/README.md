# Exercise 1.7 - External access with Ingress

## Task
"Log output" application currently outputs a timestamp and a random string (that it creates on startup) to the logs.

Add an endpoint to request the current status (timestamp and the random string) and an Ingress so that you can access it with a browser.

You can just store the random string to the memory.

## What was done

This application:

- Generates one UUID when the application starts.
- Prints the current timestamp and UUID to the logs every five seconds.
- Provides the current timestamp and UUID over HTTP at `/` and `/status`.
- Listens inside the container on port `3000`.
- Is deployed to Kubernetes with one replica.
- Uses the `log-output-svc` ClusterIP Service to forward port `2345` to the container's port `3000`.
- Uses the `log-output-ingress` Ingress to route HTTP traffic from `/` to the Service.

The Kubernetes resources are defined in the [`manifests`](./manifests) folder:

- [`deployment.yaml`](./manifests/deployment.yaml) - application Deployment
- [`service.yaml`](./manifests/service.yaml) - internal ClusterIP Service
- [`ingress.yaml`](./manifests/ingress.yaml) - external HTTP routing

The request flow is:

```text
http://localhost:8081/
  -> Ingress port 80
  -> log-output-ingress
  -> log-output-svc:2345
  -> Pod:3000
  -> Node.js application
```

## Requirements

- Docker
- Node.js and npm (only needed for running the application locally)
- `kubectl`
- k3d or another Kubernetes cluster with an Ingress controller

## Docker Image

The image is available at [`vikikone/log-output`](https://hub.docker.com/r/vikikone/log-output).

Tag used: `vikikone/log-output:v1.0`

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

### 2. Apply all Kubernetes resources

Run this from the `log_output` directory:

```bash
kubectl apply -f manifests
```

### 3. Check the deployment

Wait until the Pod is ready, then inspect the resources and logs:

```bash
kubectl rollout status deployment/log-output
kubectl get deployments,pods
kubectl get svc,ingress
kubectl logs -f deployment/log-output
```

### 4. Open the application

Open <http://localhost:8081/> in a browser, or use:

```bash
curl http://localhost:8081/
```

## Stop and restart the server

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
