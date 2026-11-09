# Exercise 5.3 - Log App, the Service Mesh Edition

## Task
> Deploy the Log Output application to Istio Ambient Mesh and extend it with a Greeter service that responds to HTTP GET requests. The Log Output application should retrieve and display the greeting alongside its existing output.
> 
> Deploy two versions of Greeter and configure traffic routing using an HTTPRoute:
> * Greeter v1: 75% of requests
> * Greeter v2: 25% of requests
> 
> Use three Kubernetes Services (greeter-svc, greeter-svc-1, and greeter-svc-2) and an Istio waypoint to manage weighted routing.
> 
> Finally, use Kiali to visualize the service communication and verify that traffic is distributed according to the configured weights.

## Overview

In this exercise, I configured Istio Ambient Mesh to manage traffic between Kubernetes applications running in a local k3d cluster on Windows.

The application consists of three components:

- **Log Output:** Generates timestamps and UUIDs and retrieves information from other services.
- **Ping Pong:** Counts requests and returns the current count.
- **Greeter:** Provides two versions that return different greetings.

The objective was to configure weighted traffic routing between two Greeter versions using Istio and verify the distribution using Kiali.

The expected traffic distribution is:

- Greeter v1: 75%
- Greeter v2: 25%

## 1. Create the Kubernetes cluster

Create a k3d cluster with two worker nodes and Traefik disabled.

```powershell
k3d cluster create istio --api-port 6550 -p "9080:80@loadbalancer" -p "9443:443@loadbalancer" --agents 2 --k3s-arg "--disable=traefik@server:*"
```

Switch to the cluster context:

```powershell
kubectl config use-context k3d-istio
```

Verify the nodes:

```powershell
kubectl get nodes
```

## 2. Install Istio Ambient Mesh

Download Istio from the official releases:

https://github.com/istio/istio/releases

Extract the Windows archive and add the directory containing `istioctl.exe` to the PowerShell PATH.

For example:

```powershell
$env:Path += ";C:\istio-1.31.1\bin"
```

Verify the installation:

```powershell
istioctl version
```

Install Istio Ambient Mesh:

```powershell
istioctl install --set profile=ambient --set values.global.platform=k3d --set values.cni.cniBinDir=/var/lib/rancher/k3s/data/cni --set values.cni.cniConfDir=/var/lib/rancher/k3s/agent/etc/cni/net.d -y
```

Verify the Istio components:

```powershell
kubectl get pods -n istio-system
```

The installation includes:

- Istiod
- Istio CNI
- ztunnel

Enable ambient mode for the `default` namespace:

```powershell
kubectl label namespace default istio.io/dataplane-mode=ambient --overwrite
```

Verify:

```powershell
kubectl get namespace default --show-labels
```

## 3. Install Gateway API

Install the Kubernetes Gateway API CRDs:

```powershell
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.0/experimental-install.yaml
```

Verify:

```powershell
kubectl get gatewayclasses
```

## 4. Deploy the applications

The Log Output and Ping Pong applications were reused from previous exercises.

The Log Output application contains two containers:

- `log-output-writer`: Generates timestamps and UUIDs.
- `log-output-reader`: Serves HTTP requests and retrieves data from other applications.

The reader uses the following environment variables:

```yaml
env:
  - name: MESSAGE
    valueFrom:
      configMapKeyRef:
        name: log-output-config
        key: MESSAGE
  - name: PINGPONG_URL
    value: http://ping-pong-svc:80/pings
  - name: GREETER_URL
    value: http://greeter-svc:80/
```

Deploy the applications using their Kubernetes manifests.

Verify:

```powershell
kubectl get pods
kubectl get services
```

## 5. Deploy Greeter v1 and v2

Two versions of the Greeter application were deployed.

Greeter v1 returns:

```text
hello from greeter v1
```

Greeter v2 returns:

```text
hello from greeter v2
```

Both versions use the same application image but have different `GREETING` environment variables.

Greeter v1:

```yaml
env:
  - name: GREETING
    value: "hello from greeter v1"
```

Greeter v2:

```yaml
env:
  - name: GREETING
    value: "hello from greeter v2"
```

Three Kubernetes Services are required:

| Service | Purpose |
|---------|---------|
| `greeter-svc` | Main Service used by Log Output |
| `greeter-svc-1` | Backend for Greeter v1 |
| `greeter-svc-2` | Backend for Greeter v2 |

The main Service selects both versions, while the backend Services select individual versions.

Apply the Log Output and Greeter manifests with Kustomize:

```powershell
kubectl apply -k .\log_output
```

Verify:

```powershell
kubectl get deployments
kubectl get services
kubectl get endpoints greeter-svc greeter-svc-1 greeter-svc-2
```

## 6. Configure the Istio waypoint

Istio Ambient Mesh uses ztunnel for secure Layer 4 communication.

However, weighted HTTP traffic routing requires Layer 7 processing.

For this purpose, I configured an Istio waypoint.

Create the waypoint:

```powershell
istioctl waypoint apply -n default --name greeter-waypoint
```

Verify:

```powershell
kubectl get gateway greeter-waypoint
kubectl get pods
```

Configure the main Greeter Service to use the waypoint:

```powershell
kubectl label service greeter-svc istio.io/use-waypoint=greeter-waypoint --overwrite
```

The waypoint processes HTTP requests to `greeter-svc` and applies the configured traffic routing rules.

## 7. Configure weighted traffic routing

Create `greeter-route.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: greeter-route
  namespace: default
spec:
  parentRefs:
    - group: ""
      kind: Service
      name: greeter-svc
  rules:
    - backendRefs:
        - name: greeter-svc-1
          port: 80
          weight: 75
        - name: greeter-svc-2
          port: 80
          weight: 25
```

The `group: ""` field is required because the HTTPRoute is attached to a Kubernetes Service rather than a Gateway.

Apply the configuration:

```powershell
kubectl apply -f .\log_output\manifests\greeter-route.yaml
```

Verify:

```powershell
kubectl get httproute greeter-route -o yaml
```

The expected conditions are:

```text
Accepted: True
ResolvedRefs: True
ResolvedWaypoints: True
```

These conditions indicate that the route is accepted and the waypoint can process the traffic.

## 8. Access the Log Output application

Forward the Istio Gateway to localhost:

```powershell
kubectl port-forward svc/log-gateway-istio 8080:80
```

The Log Output application is accessible at:

http://localhost:8080/status

<img width="471" height="auto" alt="Screenshot 2026-11-09 151641" src="https://github.com/user-attachments/assets/ef2ae86a-0be3-46e6-a9be-f4271022728a" />

Verify the response:

```powershell
Invoke-WebRequest http://localhost:8080/status -UseBasicParsing
```

Traffic passes through the Istio Gateway before reaching the Log Output Service.

## 9. Test the traffic distribution

To verify weighted routing, send multiple requests from inside the Kubernetes cluster.

Create a temporary test Pod:

```powershell
kubectl delete pod tmp-curl --ignore-not-found
kubectl run tmp-curl --image=curlimages/curl:8.10.0 --restart=Never --command -- sleep 7200
kubectl wait --for=condition=Ready pod/tmp-curl --timeout=120s
```

Send 100 requests to the main Greeter Service:

```powershell
kubectl exec tmp-curl -- sh -c 'for i in $(seq 1 100); do curl -s http://greeter-svc:80/; echo; done' | Group-Object | Select-Object Name, Count
```

The expected distribution is approximately:

```text
Name    Count
----    -----
hello from greeter v1   75
hello from greeter v2   25
```

The actual results may vary because Istio distributes requests probabilistically.

The supplied exercise example produced:

```text
76 hello from greeter v1
24 hello from greeter v2
```

This is consistent with the configured 75% / 25% distribution.

## 10. Test routing without the waypoint

The waypoint is responsible for enforcing the HTTPRoute weights.

Remove the waypoint label temporarily:

```powershell
kubectl label service greeter-svc istio.io/use-waypoint-
```

Repeat the traffic test:

```powershell
kubectl exec tmp-curl -- sh -c 'for i in $(seq 1 100); do curl -s http://greeter-svc:80/; echo; done' | Group-Object | Select-Object Name, Count
```

Without the waypoint, the expected distribution is approximately 50% for each version because the main Kubernetes Service selects both versions.

Restore the waypoint:

```powershell
kubectl label service greeter-svc istio.io/use-waypoint=greeter-waypoint --overwrite
```

Repeat the test to verify that the weighted routing is restored.

## 11. Install Prometheus and Kiali

Kiali provides a graphical view of service mesh traffic.

Prometheus collects the metrics required for traffic visualization.

Add the Prometheus Helm repository:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

Install Prometheus:

```powershell
helm upgrade --install prom prometheus-community/prometheus -n monitoring --create-namespace --set alertmanager.enabled=false --set server.persistentVolume.enabled=false
```

Install Kiali using the Istio addon manifest:

```powershell
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.31/samples/addons/kiali.yaml
```

If Prometheus runs in the `monitoring` namespace, configure Kiali to use:

```text
http://prom-prometheus-server.monitoring:80
```

Verify Kiali:

```powershell
kubectl get pods -n istio-system
kubectl rollout status deployment/kiali -n istio-system
```

Forward the Kiali Service:

```powershell
kubectl port-forward svc/kiali 20001:20001 -n istio-system
```

Open:

http://localhost:20001/kiali

<img width="1880" height="auto" alt="Screenshot 2026-11-09 154234" src="https://github.com/user-attachments/assets/0bc78ebb-5705-41a6-842a-e167a244580c" />

## 12. Verify traffic using Kiali

Open the Kiali dashboard and navigate to **Traffic Graph**.

Select the `default` namespace.

Generate requests through the Log Output Gateway:

```powershell
1..300 | ForEach-Object {
    Invoke-WebRequest http://localhost:3000/status -UseBasicParsing | Out-Null
}
```

The expected traffic flow is:

```text
   log-output
        |
        v
    greeter-svc
      /     \
     v       v
greeter-v1  greeter-v2
    75%       25%
```

The graph should also show communication with Ping Pong and PostgreSQL when those applications are active.

<img width="1587" height="auto" alt="Screenshot 2026-11-09 165004" src="https://github.com/user-attachments/assets/b493f53f-0806-4100-8a96-d618df7721b2" />

Kiali uses Prometheus metrics to display request rates and traffic distribution.

Metrics must be collected while requests are being generated. Requests made before Prometheus starts collecting metrics will not appear in the graph.

## 13. Troubleshooting

### HTTPRoute is not accepted

Check:

```powershell
kubectl describe httproute greeter-route
```

The parent reference must explicitly identify the Kubernetes Service:

```yaml
parentRefs:
  - group: ""
    kind: Service
    name: greeter-svc
```

### Gateway returns HTTP 404

Check the Gateway HTTPRoute:

```powershell
kubectl describe httproute greeter-route
```

Verify the Log Output Service port:

```powershell
kubectl get svc log-output-svc
```

Test a single request before generating large amounts of traffic:

```powershell
Invoke-WebRequest http://localhost:3000/status -UseBasicParsing
```

### Kiali graph is empty

Verify that Prometheus and Kiali are running:

```powershell
kubectl get pods -n monitoring
kubectl get pods -n istio-system
```

Generate fresh traffic and refresh the graph.

### Old applications remain visible in Kiali

Kiali may show historical traffic from previously deleted applications.

Select a shorter time window and disable idle nodes.

Verify the remaining resources:

```powershell
kubectl get pods,deployments,services -A
```

## 14. Results

The exercise demonstrates how Istio Ambient Mesh can manage HTTP traffic between Kubernetes applications.

The main outcomes are:

1. Configured Istio Ambient Mesh in a local k3d cluster.
2. Deployed two versions of the Greeter application.
3. Configured an Istio waypoint for Layer 7 traffic management.
4. Created an HTTPRoute with 75% / 25% weighted routing.
5. Used Prometheus and Kiali to inspect service communication and traffic distribution.

The supplied exercise example showed that the traffic distribution was approximately 75% for Greeter v1 and 25% for Greeter v2 when the waypoint was enabled.

Without the waypoint, the distribution was approximately equal between both versions.

This demonstrates that the waypoint is responsible for enforcing the configured HTTP routing weights.

## References

- [Istio Ambient Mesh](https://istio.io/latest/docs/ambient/)
- [Istio Waypoint Proxies](https://istio.io/latest/docs/ambient/usage/waypoint/)
- [Istio Traffic Management](https://istio.io/latest/docs/concepts/traffic-management/)
- [Kubernetes Gateway API](https://gateway-api.sigs.k8s.io/)
- [Kiali Documentation](https://kiali.io/docs/)
- [DevOps with Kubernetes](https://courses.mooc.fi/org/uh-cs/courses/devops-with-kubernetes)

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
