# Exercise 2.4 - The project, step 9

## Task
Create a namespace called project for the project and move everything related to the project to that namespace. Use the new namespace in the future for all the project related exercises.

## What was done

- Created a namespace `project` for the project

## Docker image

The Docker image is available at [`vikikone/todo-app`](https://hub.docker.com/r/vikikone/todo-app).

Tag used: `vikikone/todo-app:v2.2`

The backend image is `vikikone/todo-backend:v2.2`.

## Implementation steps

### 1. Build and push the image

From the `the_project` directory:

```powershell
docker build -t vikikone/todo-app:v2.2 .
docker push vikikone/todo-app:v2.2

cd ..\todo_backend
docker build -t vikikone/todo-backend:v2.2 .
docker push vikikone/todo-backend:v2.2

cd ..\the_project
```

### 2. Deploy the application

Create the namespace with the kubectl command before applying the project resources:

```bash
kubectl create namespace project
```

Run these commands from the `the_project` directory:

```bash
kubectl apply -f ..\todo_backend\manifests
kubectl apply -f manifests
kubectl rollout status deployment/todo-backend -n project
kubectl rollout status deployment/the-project -n project
```

### 3. Check the resources

```bash
kubectl get deployments,pods -n project
kubectl get svc,ingress -n project
kubectl logs -n project -f deployment/the-project
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
kubectl scale deployment/the-project --replicas=0 -n project
```

To start it again:

```bash
kubectl scale deployment/the-project --replicas=1 -n project
kubectl rollout status deployment/the-project -n project
```

The cached image remains available after the pod is recreated because it is
stored in the persistent volume.

## Remove the application resources

```bash
kubectl delete -f manifests -n project
```
