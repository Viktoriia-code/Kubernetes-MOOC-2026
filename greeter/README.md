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

The current local Kustomization does not include an Istio Gateway for the
Log Output application. Forward the Service directly:

```powershell
kubectl port-forward service/log-output-svc 3000:2345
```

The Log Output application should be accessible at:

http://localhost:3000/status

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
