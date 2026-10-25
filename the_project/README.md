# Exercise 1.12 - The project, step 6

## Task
Since the project looks a bit boring right now, let's add a picture!

The goal is to add an hourly image to the project.

Get a random picture from Lorem Picsum like https://picsum.photos/1200 and display it in the project. Find a way to store the image so it stays the same for 10 minutes.

After 10 minutes have passed, you might give the old pic still one more time, and for the next request, there should be a new picture
Make sure to cache the image into a persistent volume so that the API isn't needed for new images every time we access the application or the container crashes.

The best way to test what happens when your container shuts down is likely by shutting down the container, so you can add logic for that as well, for testing purposes.

After this exercise, your app can look for example like the following:


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

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v1.12`

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
docker build -t vikikone/todo-app:v1.12 .
docker push vikikone/todo-app:v1.12
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
