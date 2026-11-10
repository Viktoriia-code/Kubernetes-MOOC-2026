# Exercise 5.7 - Deploy Ping-pong to Knative

## Task
> Make the Ping-pong service of the Log Output application serverless by deploying it as a Knative Service. Log Output must call the Knative Service using its fully qualified Kubernetes DNS name, and the Gateway route must rewrite the browser request to the Knative hostname.

## Overview

The goal of this exercise was to deploy the Ping Pong application as a serverless service using Knative Serving.

Log Output remains a regular Kubernetes Deployment, while Ping Pong runs as a Knative Service.

I also configured Istio Gateway API to expose both applications through a single entry point.

## Technologies

* Kubernetes with k3d
* Knative Serving 1.24.0
* Kourier
* Istio 1.30.8
* Gateway API 1.4.0
* Helm
* PostgreSQL

## 1. Deploy Ping Pong as a Knative Service

Ping Pong was deployed in the `exercises` namespace using Knative Serving instead of a regular Kubernetes Deployment.

Knative manages the application's Deployment, Service, ReplicaSet, revisions and scaling.

Verify the Knative Service:

```powershell
kubectl get ksvc pingpong -n exercises
```

Output:

```text
NAME       URL                                   LATESTCREATED    LATESTREADY      READY
pingpong   http://pingpong.exercises.localhost   pingpong-00001   pingpong-00001   True
```

Kourier is used as the networking layer for Knative.

### Knative Service Status

The following screenshot shows the Ping Pong Knative Service running successfully with `READY=True`.

![Ping Pong Knative Service](./images/knative-service.png)

## 2. Configure Internal Communication

Log Output communicates with Ping Pong through its fully qualified Kubernetes Service address:

```text
http://pingpong.exercises.svc.cluster.local/pings
```

The environment variable in the Log Output Deployment is configured as follows:

```yaml
env:
  - name: PINGPONG_URL
    value: "http://pingpong.exercises.svc.cluster.local/pings"
```

Knative creates a Kubernetes Service named `pingpong` with type `ExternalName`, pointing to:

```text
kourier-internal.kourier-system.svc.cluster.local
```

This allows Log Output to communicate with Ping Pong through Knative networking.

I verified the connection using a temporary curl Pod:

```powershell
kubectl run curl-test -n exercises --rm -it --restart=Never --image=curlimages/curl -- http://pingpong.exercises.svc.cluster.local/pings
```

The request returned the Ping Pong counter successfully.

Log Output also displayed the counter:

```text
Ping / Pongs: 2
```

## 3. Install Gateway API

Install the Gateway API custom resource definitions:

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml
```

Verify:

```powershell
kubectl get crd gateways.gateway.networking.k8s.io
kubectl get crd httproutes.gateway.networking.k8s.io
```

Both custom resource definitions were installed successfully.

## 4. Install Istio

Istio is used as the Gateway API controller, while Kourier continues handling Knative networking.

Add the Istio Helm repository:

```powershell
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update
```

Install Istio base:

```powershell
helm upgrade --install istio-base istio/base `
  --namespace istio-system `
  --create-namespace `
  --version 1.30.8 `
  --wait
```

Install the Istio control plane:

```powershell
helm upgrade --install istiod istio/istiod `
  --namespace istio-system `
  --version 1.30.8 `
  --wait
```

Verify:

```powershell
kubectl get pods -n istio-system
kubectl get gatewayclass
```

Results:

```text
NAME                      READY   STATUS
istiod-6bc87bb9bd-qgs5j   1/1     Running
```

```text
NAME    CONTROLLER                    ACCEPTED
istio   istio.io/gateway-controller   True
```

## 5. Configure Gateway

Create `log_output/manifests/gateway.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: log-gateway
spec:
  gatewayClassName: istio
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        kinds:
          - kind: HTTPRoute
```

Apply the Gateway:

```powershell
kubectl apply -f .\log_output\manifests\gateway.yaml -n exercises
```

Istio automatically creates the `log-gateway-istio` Deployment and Service.

Verify:

```powershell
kubectl get gateway -n exercises
kubectl get deployment log-gateway-istio -n exercises
kubectl get svc log-gateway-istio -n exercises
```

The Gateway Deployment was running:

```text
NAME                READY   AVAILABLE
log-gateway-istio   1/1     1
```

The Gateway Service was created as a `LoadBalancer`.

Its external IP remained pending, so port forwarding was used for local access.

### Istio Gateway Status

The following screenshot shows the Istio Gateway Deployment running successfully.

![Istio Gateway Deployment](./images/istio-gateway.png)

## 6. Configure HTTPRoute

Create `log_output/manifests/route.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: log-route
spec:
  parentRefs:
    - name: log-gateway
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /pingpong
      filters:
        - type: URLRewrite
          urlRewrite:
            hostname: pingpong.exercises.localhost
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /
      backendRefs:
        - name: pingpong
          port: 80

    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: log-output-svc
          port: 2345
```

The HTTPRoute defines two routing rules:

1. Requests to `/pingpong` are forwarded to the Knative Service. The hostname is rewritten to `pingpong.exercises.localhost`, matching the hostname configured in Knative.
2. All other requests, including `/status`, are forwarded to `log-output-svc` on port 2345.

Apply the HTTPRoute:

```powershell
kubectl apply -f .\log_output\manifests\route.yaml -n exercises
```

Verify:

```powershell
kubectl get httproute -n exercises
kubectl describe httproute log-route -n exercises
```

## 7. Test the Applications

Forward the Istio Gateway port:

```powershell
kubectl port-forward -n exercises svc/log-gateway-istio 8080:80
```

Both applications are accessible through the same Gateway.

### Log Output

The Log Output application is available at:

http://localhost:8080/status

The following screenshot shows the Log Output response, including the Ping Pong counter.

![Log Output Status](./images/log-output-status.png)

### Ping Pong

The Ping Pong application is available at:

http://localhost:8080/pingpong

The following screenshot shows the Ping Pong response through the Istio Gateway.

![Ping Pong Response](./images/pingpong-response.png)

Alternatively, test both endpoints using PowerShell:

```powershell
curl.exe -i http://localhost:8080/status
curl.exe -i http://localhost:8080/pingpong
```

Both endpoints were tested successfully.

## 8. Knative Scaling

Knative Serving supports automatic scaling based on incoming requests, including scaling to zero when an application is idle.

Inspect the revision and replica counts:

```powershell
kubectl get revisions -n exercises
kubectl get pods -n exercises
```

After a period without requests, Knative can scale Ping Pong down to zero replicas.

A new request should trigger the creation of a Pod.

This scaling behavior has not yet been separately verified in this deployment.

## Result

Ping Pong was successfully deployed as a Knative Service.

Log Output continues running as a regular Kubernetes Deployment and communicates with Ping Pong through its fully qualified internal Service address.

Kourier handles Knative networking, while Istio Gateway API provides external routing for both applications.

Both endpoints were tested successfully:

* `http://localhost:8080/status`
* `http://localhost:8080/pingpong`

The exercise demonstrates how an existing Kubernetes application can be deployed using Knative Serving while preserving communication with other services in the cluster.

## Previous important steps
<details>
<summary>Argo CD</summary>

### Install Argo CD
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

The final result:
<img width="1612" height="886" alt="image" src="https://github.com/user-attachments/assets/bffb1ce8-30ba-48e5-8290-887f73418eb7" />

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

The [`log-output-gitops.yaml`](../.github/workflows/log-output-gitops.yaml) workflow runs when changes are pushed to `main` and affect either the `log_output/` directory or the workflow itself. It:

1. Check out the repository.
2. Authenticate with Docker Hub using GitHub repository secrets.
3. Build the Log Output Docker image.
4. Push the image to Docker Hub using the Git commit SHA as its tag.
5. Update the image reference in `kustomization.yaml`.
6. Commit the updated `log_output/kustomization.yaml` back to Git with a release message.

The Docker Hub credentials are provided through the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` GitHub Actions secrets. Argo CD detects the committed image update and deploys the new application version.

<img width="962" height="817" alt="image" src="https://github.com/user-attachments/assets/da0d445a-e3ef-4ec5-be19-4025eb036a59" />


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

Argo CD is installed and connected to the GitHub repository. The GitHub Actions workflow for building, publishing, and releasing Log Output is configured. Initial synchronization was attempted, and deployment issues were identified.

The complete automated deployment workflow still requires end-to-end verification.
</details>

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
the Ping-pong count and greeting when the corresponding Services are available.
</details>

<details>
<summary>Deploy with Istio Ambient Mode</summary>

The Kustomization also deploys the `greeter` service used by the service-mesh
exercise. `greeter-svc` is the stable service called by the log-output reader.
Its `HTTPRoute` sends 75% of requests to `greeter-svc-1` and 25% to
`greeter-svc-2`.

After the `default` namespace has been enrolled in Istio Ambient Mode, apply
the application:

```powershell
kubectl apply -k .
kubectl rollout status deployment/greeter-dep-v1
kubectl rollout status deployment/greeter-dep-v2
kubectl rollout status deployment/log-output-dep
```

Generate traffic through the log-output Service and inspect the greeting:

```powershell
kubectl port-forward service/log-output-svc 3000:2345
1..100 | ForEach-Object { curl.exe -s http://localhost:3000/ | Select-String Greeting }
```

The `greeter` image is built and published by the Log Output GitHub Actions
workflow together with the log-output image.
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
