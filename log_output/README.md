# 4.7 - Baby steps to GitOps

## Task

> Move the Log output application to use GitOps so that when you commit to the repository, the application is automatically updated.

## Technologies

* Kubernetes (k3d)
* Argo CD
* GitHub Actions
* Docker Hub
* Kustomize

## Implementation

### 1. Install Argo CD

Created a dedicated namespace and installed Argo CD in the local Kubernetes cluster.

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Accessed the Argo CD interface using port forwarding:

```bash
kubectl port-forward svc/argocd-server -n argocd 8082:443
```

### 2. Configure the Argo CD Application

Created an application with the following configuration:

| Setting | Value |
|---|---|
| Application name | log-output |
| Project | default |
| Repository | https://github.com/Viktoriia-code/Kubernetes-MOOC-2026 |
| Target revision | main |
| Source path | Log Output Kustomize directory |
| Destination cluster | https://kubernetes.default.svc |
| Initial sync policy | Manual |

Argo CD uses the Kubernetes manifests stored in GitHub as the desired state of the application.

### 3. Configure Kubernetes Manifests

Used Kustomize to manage the Log Output Deployment and Service.

The `kustomization.yaml` file defines the Kubernetes resources and container image references.

During the initial synchronization, two issues were identified:

* The local Kubernetes cluster did not recognize the Gateway API resources `Gateway` and `HTTPRoute`.
* The Log Output Pod entered `ImagePullBackOff` because the specified Docker image tag was unavailable in Docker Hub.

### 4. Enable Automatic Synchronization

After a successful initial deployment, change the Argo CD synchronization policy from Manual to Automatic.

Argo CD then monitors the Git repository and applies configuration changes to the Kubernetes cluster automatically.

### 5. Configure GitHub Actions

The GitHub Actions workflow should:

1. Check out the repository.
2. Authenticate with Docker Hub using GitHub repository secrets.
3. Build the Log Output Docker image.
4. Push the image to Docker Hub using the Git commit SHA as its tag.
5. Update the image reference in `kustomization.yaml`.
6. Commit the updated configuration to GitHub.

Argo CD detects the updated configuration and deploys the new application version.

## GitOps Workflow

```text
Developer pushes code to GitHub
              |
              v
       GitHub Actions
              |
              v
    Build and push image
         to Docker Hub
              |
              v
   Update kustomization.yaml
              |
              v
     Commit changes to Git
              |
              v
     Argo CD detects changes
              |
              v
    Kubernetes deployment
```

## Verification

To verify the completed implementation:

1. Modify the Log Output application.
2. Commit and push the changes to GitHub.
3. Verify that GitHub Actions builds and publishes a new Docker image.
4. Confirm that `kustomization.yaml` contains the updated image tag.
5. Check that Argo CD automatically synchronizes the application.
6. Verify that the updated Log Output Pod is running successfully.

## Status

Argo CD was installed and connected to the GitHub repository. Initial synchronization was attempted, and deployment issues were identified.

The complete automated deployment workflow still requires verification.

## Important steps

<details>
<summary>Local Kubernetes deployment</summary>

The Kustomization is intended for a local Kubernetes cluster. It deploys the
ConfigMap, Deployment, and Service from
[`kustomization.yaml`](./kustomization.yaml). The GKE-specific Gateway and
HTTPRoute manifests are kept in `manifests/` for the cloud version, but are not
included in the local Kustomization.

Prerequisites:

- Docker
- `kubectl`
- A running local Kubernetes cluster, such as Docker Desktop Kubernetes,
  Minikube, or Kind
- A deployed Ping-pong Service named `ping-pong-svc` if the response should
  include the Ping-pong count

Apply the resources:

```powershell
kubectl apply -k .
kubectl rollout status deployment/log-output-dep
```

Check the workload:

```powershell
kubectl get deployment,pods,svc
```

Forward the Service to your computer:

```powershell
kubectl port-forward service/log-output-svc 3000:2345
```

Open [http://localhost:3000](http://localhost:3000). Keep the port-forward
command running while using the application.

You can also test it with PowerShell:

```powershell
curl.exe http://localhost:3000/
curl.exe http://localhost:3000/status
```

The response contains the ConfigMap value, generated status information, and
the Ping-pong count when the Ping-pong Service is available.
</details>

<details>
<summary>Build and use a local image</summary>

The manifests currently use `vikikone/log-output:v2.5`. If you change the
source code and use a local cluster, build an image in the runtime used by
that cluster.

For Docker Desktop Kubernetes:

```powershell
docker build -t vikikone/log-output:v2.5 .
kubectl rollout restart deployment/log-output-dep
kubectl rollout status deployment/log-output-dep
```

For Minikube, build inside Minikube's Docker daemon:

```powershell
minikube docker-env | Invoke-Expression
docker build -t vikikone/log-output:v2.5 .
kubectl rollout restart deployment/log-output-dep
```

For Kind, load the image into the cluster:

```powershell
docker build -t vikikone/log-output:v2.5 .
kind load docker-image vikikone/log-output:v2.5
kubectl rollout restart deployment/log-output-dep
```
</details>

<details>
<summary>Verify the shared file</summary>

The writer and reader containers use the same volume. Inspect the file from
the reader container:

```powershell
kubectl exec deployment/log-output-dep -c log-output-reader -- `
  cat /usr/src/app/files/status.txt
```

Run the command again after a few seconds. A new line should appear, while the
UUID remains unchanged until the writer container restarts.

View both container logs:

```powershell
kubectl logs deployment/log-output-dep -c log-output-writer
kubectl logs deployment/log-output-dep -c log-output-reader
```
</details>

<details>
<summary>Readiness</summary>

The reader has a readiness probe at `/status`. It becomes ready only when it
can read the shared file and successfully contact the Ping-pong Service. Until
then, the Pod may show `1/2` ready and the Service will not route traffic to
the reader.

Check readiness and events:

```powershell
kubectl get pods
kubectl describe pod -l app=log-output
kubectl get endpoints log-output-svc
kubectl get events --sort-by=.lastTimestamp
```

If the reader is not ready, verify that Ping-pong is running and exposes the
expected Service:

```powershell
kubectl get pods -l app=ping-pong
kubectl get service ping-pong-svc
kubectl get endpoints ping-pong-svc
kubectl logs deployment/ping-pong
```
</details>

<details>
<summary>Stop and remove</summary>

Scale the application down temporarily:

```powershell
kubectl scale deployment/log-output-dep --replicas=0
```

Restore it:

```powershell
kubectl scale deployment/log-output-dep --replicas=1
kubectl rollout status deployment/log-output-dep
```

Remove the Log output resources:

```powershell
kubectl delete -k .
```
</details>

<details>
<summary>Project structure</summary>

```text
log_output/
├── Dockerfile
├── generator.js
├── server.js
├── package.json
├── kustomization.yaml
└── manifests/
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    ├── gateway.yaml       # GKE only; excluded from local Kustomize
    └── route.yaml         # GKE only; excluded from local Kustomize
```
</details>