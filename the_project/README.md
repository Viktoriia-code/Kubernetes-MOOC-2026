# Exercise 1.8 - The project, step 5

## Task
Use Ingress to access the project. You can delete the Ingress of the "Log output" application so they don't interfere with this exercise. We'll look more into paths and routing in the next exercise, and at that point, you can configure the project to run with the "Log output" application side by side.

## What was done

The project is exposed through a Kubernetes Ingress:

- The previous NodePort configuration was removed.
- The Deployment runs the application on container port `3001`.
- The `the-project` Service is an internal ClusterIP Service.
- The Service forwards port `3004` to the application's port `3001`.
- The `the-project-ingress` Ingress routes HTTP traffic from `/` to the Service.

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v1.5`

## Run the project

### 1. Create or select a k3d cluster

For a new cluster, expose the Ingress controller on port `8081`:

```bash
k3d cluster create k3s-default --agents 2 -p "8081:80@loadbalancer"
kubectl config use-context k3d-k3s-default
```

If the cluster already exists, select it instead:

```bash
kubectl config use-context k3d-k3s-default
```

### 2. Deploy the application

Run these commands from the `the_project` directory:

```bash
kubectl apply -f manifests
kubectl rollout status deployment/the-project
```

### 3. Check the resources

```bash
kubectl get deployments,pods
kubectl get svc,ingress
kubectl logs -f deployment/the-project
```

### 4. Access the application

Open <http://localhost:8081/> in a browser, or use:

```bash
curl http://localhost:8081/
```

The traffic flow is:

```text
localhost:8081
  -> Ingress port 80
  -> the-project-ingress
  -> the-project:3004
  -> Pod:3001
  -> todo application
```

## Stop and restart the application

To stop the application while keeping its Kubernetes resources:

```bash
kubectl scale deployment/the-project --replicas=0
```

To start it again:

```bash
kubectl scale deployment/the-project --replicas=1
kubectl rollout status deployment/the-project
```

## Remove the application resources

```bash
kubectl delete -f manifests
```
