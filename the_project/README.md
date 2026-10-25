# Exercise 2.2 - The project, step 8

## Task
The next step is to create a new service that takes care of saving the todo items.

This new service, let us call it todo-backend, should have a GET /todos endpoint for fetching the list of todos and a POST /todos endpoint for creating a new todo. The todos can be saved in memory, we'll add a database later.

The role of the service that we made in previous exercises (Todo-app in the figure) is to serve the HTML and possibly JavaScript to the browser. Also, the logic for serving random pictures and caching those remains in that service. The new service then takes care of the todo items.

So the role of todo-app is pretty much the same, it serves the html with rended todo items that it gets from the new todo-backend service.

After this exercise, you should be able to create new todos using the form, and the created todos should be rendered in the browser.

## What was done

The project is exposed through a Kubernetes Ingress and serves a cached image:

- The Deployment runs the application on container port `3001`.
- The `the-project` Service is an internal ClusterIP Service.
- The Service forwards port `3004` to the application's port `3001`.
- The `the-project-ingress` Ingress routes HTTP traffic from `/` to the Service.
- The `/image` endpoint fetches from `https://picsum.photos/1200` only when the cache is missing or older than ten minutes.
- The image is stored in the `image-cache-claim` persistent volume claim, so it survives container restarts.
- `todo-backend` stores todos in memory and exposes GET and POST `/todos`.
- The frontend proxies `/todos` requests to `todo-backend-svc:2345`.
- The todo input has a maximum length of 140 characters.
- The Send button creates a todo and refreshes the list.

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v2.2`

The backend image is `vikikone/todo-backend:v2.2`.

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
docker build -t vikikone/todo-app:v2.2 .
docker push vikikone/todo-app:v2.2

cd ..\todo_backend
docker build -t vikikone/todo-backend:v2.2 .
docker push vikikone/todo-backend:v2.2

cd ..\the_project
```

### 3. Deploy the application

Run these commands from the `the_project` directory:

```bash
kubectl apply -f ..\todo_backend\manifests
kubectl apply -f manifests
kubectl rollout status deployment/todo-backend
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

The first image request downloads and stores the image. Requests during the next ten minutes reuse the persistent cached file. After ten minutes, one request may still receive the old image while the application refreshes the cache in the background; a subsequent request receives the new image.

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
