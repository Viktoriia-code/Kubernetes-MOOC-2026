# Exercise 1.13 - The project, step 7

## Task
It is time to start adding some real functionality to our project! As promised earlier, the project shall have a todo app functionality. So in this exercise

1. add an input field. The input should not take todos that are over 140 characters long.
2. add a send button. It does not have to send the todo yet.
3. add a list of the existing todos with some hardcoded todos.

## What was done

The project is exposed through a Kubernetes Ingress and serves a cached image:

- The Deployment runs the application on container port `3001`.
- The `the-project` Service is an internal ClusterIP Service.
- The Service forwards port `3004` to the application's port `3001`.
- The `the-project-ingress` Ingress routes HTTP traffic from `/` to the Service.
- The `/image` endpoint fetches from `https://picsum.photos/1200` only when the cache
  is missing or older than ten minutes.
- The image is stored in the `image-cache-claim` persistent volume claim, so it
  survives container restarts.
- The todo input has a maximum length of 140 characters.
- The Send button is present but does not submit todos yet.
- The page displays a hardcoded list of existing todos.

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v1.14`

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

### 2. Build and push the image

From the `the_project` directory:

```powershell
docker build -t vikikone/todo-app:v1.14 .
docker push vikikone/todo-app:v1.14
```

### 3. Deploy the application

Run these commands from the `the_project` directory:

```bash
kubectl apply -f manifests/persistentvolume.yaml
kubectl apply -f manifests/persistentvolumeclaim.yaml
kubectl apply -f manifests
kubectl rollout status deployment/the-project
```

### 4. Check the resources

```bash
kubectl get deployments,pods
kubectl get svc,ingress
kubectl logs -f deployment/the-project
```

### 5. Access the application

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
  -> cached image application
```

## Test image caching

Open the page in a browser or request the image directly:

```powershell
curl.exe http://localhost:8081/
curl.exe -o image-1.jpg http://localhost:8081/image
```

The first image request downloads and stores the image. Requests during the
next ten minutes reuse the persistent cached file. After ten minutes, one
request may still receive the old image while the application refreshes the
cache in the background; a subsequent request receives the new image.

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

The cached image remains available after the pod is recreated because it is
stored in the persistent volume.

## Remove the application resources

```bash
kubectl delete -f manifests
```
