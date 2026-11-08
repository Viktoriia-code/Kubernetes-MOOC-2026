# Exercise 5.2: Istio Service Mesh

## Task
> Install Istio CLI and configure Istio Ambient Mode on a k3d Kubernetes cluster. Deploy the sample application and follow the official Istio tutorial up to the cleanup section.
> 
> Install Prometheus and configure Kiali to use it for monitoring and visualizing network traffic between services.

## Prerequisites

The following tools are required:

* Docker
* k3d
* kubectl
* Helm
* PowerShell
* Istio CLI (`istioctl`)

## 1. Create a k3d Cluster

Create a dedicated cluster with two worker nodes and Traefik disabled to avoid conflicts with Istio gateways.

```powershell
k3d cluster create istio --api-port 6550 -p "9080:80@loadbalancer" -p "9443:443@loadbalancer" --agents 2 --k3s-arg "--disable=traefik@server:*"
```

Select the cluster and verify its nodes:

```powershell
kubectl config use-context k3d-istio
kubectl get nodes
```
<img width="1141" height="auto" alt="Screenshot 2026-11-08 201506" src="https://github.com/user-attachments/assets/0f1761b6-6cd0-405d-875a-a46a31f6757a" />

<img width="1627" height="auto" alt="Screenshot 2026-11-08 202715" src="https://github.com/user-attachments/assets/fd7d16cb-b445-4868-bba0-af6dcdc12f11" />


## 2. Install the Istio CLI

Download the Windows release archive from the [Istio GitHub releases](https://github.com/istio/istio/releases).

Extract the archive and add its `bin` directory to your PowerShell PATH.

For example, using Istio 1.31.4:

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/istio/istio/releases/download/1.31.1/istioctl-1.31.1-win.zip" `
  -OutFile "istioctl.zip"

Expand-Archive -Path "istioctl.zip" -DestinationPath ".\istio-cli"

$istioExe = Get-ChildItem ".\istio-cli" -Recurse -Filter "istioctl.exe" | Select-Object -First 1

$env:PATH = "$($istioExe.DirectoryName);$env:PATH"

istioctl version
```

Replace the directory name with the version you downloaded.

The Istio release also includes the Bookinfo application manifests and monitoring addons used in this exercise.

## 3. Install Istio Ambient Mode

### Install Gateway API CRDs

```powershell
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.0/experimental-install.yaml
```

### Install Istio

Use the Ambient profile with the k3d platform configuration:

```powershell
istioctl install `
  --set profile=ambient `
  --set values.global.platform=k3d `
  --skip-confirmation
```

The k3d platform setting configures Istio for the nonstandard CNI paths used by k3d.

### Verify the Installation

```powershell
kubectl get pods -n istio-system
```

Check that the Istio control plane, CNI components, and ztunnel Pods are running.

<img width="656" height="auto" alt="Screenshot 2026-11-08 205809" src="https://github.com/user-attachments/assets/9bf3c5e6-226d-4032-9683-d78baabaf549" />

## 4. Deploy the Bookinfo Application

Bookinfo is a sample application consisting of several microservices:

* `productpage`: Displays book information.
* `details`: Provides book details.
* `reviews`: Returns book reviews.
* `ratings`: Provides book ratings.

Deploy the application:

```powershell
kubectl apply -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/platform/kube/bookinfo.yaml
kubectl apply -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/platform/kube/bookinfo-versions.yaml
```

Verify the Pods:

```powershell
kubectl get pods
```

<img width="551" height="auto" alt="Screenshot 2026-11-08 210221" src="https://github.com/user-attachments/assets/2931e0c3-7b91-4e3d-a344-caa390993081" />

### Configure the Gateway

```powershell
kubectl apply -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/gateway-api/bookinfo-gateway.yaml
```

Configure the gateway Service as `ClusterIP`:

```powershell
kubectl annotate gateway bookinfo-gateway networking.istio.io/service-type=ClusterIP --overwrite
```

Wait until the gateway is ready:

```powershell
kubectl wait --for=condition=programmed gateway/bookinfo-gateway --timeout=180s
```

<img width="987" height="auto" alt="Screenshot 2026-11-08 211530" src="https://github.com/user-attachments/assets/e6ccdc26-d777-4e62-bfe8-2c377b1c6b3b" />

### Access Bookinfo

```powershell
kubectl port-forward svc/bookinfo-gateway-istio 8080:80
```

Open:

http://localhost:8080/productpage

<img width="1626" height="auto" alt="Screenshot 2026-11-08 211801" src="https://github.com/user-attachments/assets/95d7e949-61ef-4036-a938-8e3d0c0a6747" />

Refresh the page several times to observe different versions of the reviews service.

## 5. Enable Ambient Mode

Add the `default` namespace to the service mesh:

```powershell
kubectl label namespace default istio.io/dataplane-mode=ambient --overwrite
```

Verify the workloads:

```powershell
kubectl get pods
istioctl ztunnel-config workloads
```

Bookinfo workloads should appear in the ztunnel configuration using the `HBONE` protocol.

<img width="803" height="auto" alt="Screenshot 2026-11-08 212713" src="https://github.com/user-attachments/assets/189795a2-b547-4608-9ad5-6c5a730b49fd" />

Ambient Mode handles traffic through node level ztunnel proxies without injecting sidecar containers into the application Pods.

## 6. Install Prometheus

Prometheus collects metrics generated by Istio.

Add the Helm repository:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

Install Prometheus:

```powershell
helm upgrade --install prom prometheus-community/prometheus --namespace monitoring --create-namespace
```

Verify the installation:

```powershell
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

The expected Prometheus server Service is:

```text
prom-prometheus-server
```

<img width="721" height="auto" alt="Screenshot 2026-11-08 213742" src="https://github.com/user-attachments/assets/a5110955-f195-4730-ac4c-00daf5a57822" />

Its internal address is:

```text
http://prom-prometheus-server.monitoring:80
```

**Important:** Prometheus must be configured to discover and scrape Istio metrics endpoints. Installing the Helm chart alone does not guarantee that Istio metrics are being collected.

Verify the scrape targets in Prometheus before using Kiali.

## 7. Install and Configure Kiali

Kiali provides a graphical interface for inspecting service mesh traffic and configuration.

Copy the Istio Kiali addon manifest:

```powershell
$kialiManifest = Join-Path $PWD "kiali.yaml"

Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/istio/istio/1.31.1/samples/addons/kiali.yaml" `
  -OutFile $kialiManifest

notepad $kialiManifest
```

Find the Prometheus configuration inside the Kiali ConfigMap and configure it to use the existing Prometheus Service.

```yaml
external_services:
  prometheus:
    enabled: true
    url: http://prom-prometheus-server.monitoring:80
```

Preserve the indentation and surrounding configuration in the original manifest.

Apply the modified file:

```powershell
kubectl apply -f $kialiManifest
```

Wait for Kiali:

```powershell
kubectl rollout status deployment/kiali -n istio-system
```

Open the dashboard:

```powershell
istioctl dashboard kiali
```

<img width="1862" height="auto" alt="Screenshot 2026-11-08 214449" src="https://github.com/user-attachments/assets/ed7a4f3c-e2d3-4729-ba44-58c7536b1738" />

## 8. Generate and Visualize Traffic

Keep the Bookinfo gateway port forwarding active in a separate PowerShell window:

```powershell
kubectl port-forward svc/bookinfo-gateway-istio 8080:80
```

Generate requests to the Bookinfo application:

```powershell
1..100 | ForEach-Object {
  curl.exe -s -o NUL http://localhost:8080/productpage
}
```

Open Kiali and:

1. Select the `default` namespace.
2. Open **Traffic Graph**.
3. Choose the available workload or service graph.
4. Inspect the connections between Bookinfo services.
5. Observe the traffic metrics.

<img width="1582" height="auto" alt="Screenshot 2026-11-08 214821" src="https://github.com/user-attachments/assets/f3d430b3-21c2-433d-abc1-614a2f311319" />

Allow time for Prometheus to collect the metrics.

### Verify Metrics in Prometheus

Forward the Prometheus Service:

```powershell
kubectl port-forward svc/prom-prometheus-server -n monitoring 9090:80
```

Open:

http://localhost:9090

In Prometheus, query:

```promql
istio_tcp_connections_opened_total
```

<img width="1887" height="auto" alt="Screenshot 2026-11-08 215012" src="https://github.com/user-attachments/assets/e7edcd6a-2fcb-48a8-8e23-e357cdd3344b" />

This metric can help verify TCP traffic observed by Istio.

In Ambient Mode, ztunnel provides TCP level metrics. HTTP request metrics require additional Layer 7 processing, typically through waypoint proxies.

## 9. Verification

The exercise is complete when:

* Istio Ambient Mode is installed successfully.
* The Bookinfo application is running.
* The Bookinfo product page is accessible.
* The namespace is enrolled in Ambient Mode.
* Bookinfo workloads appear in the ztunnel configuration.
* Prometheus collects Istio traffic metrics.
* Kiali displays the service mesh and its traffic.

## 10. Troubleshooting

### Check Istio Components

```powershell
kubectl get pods -n istio-system
istioctl verify-install
```

### Check ztunnel

```powershell
kubectl get pods -n istio-system -l app=ztunnel
```

Inspect the events if a Pod fails to start:

```powershell
kubectl describe pods -n istio-system -l app=ztunnel
```

### Check Bookinfo

```powershell
kubectl get pods
kubectl get gateway
kubectl get svc
```

### Check Prometheus

```powershell
kubectl get pods,svc -n monitoring
```

If Kiali shows no traffic, verify that Prometheus is collecting Istio metrics and that Kiali is configured with the correct Prometheus URL.

## 11. Cleanup

Stop any active port forwarding commands before cleanup.

### Remove Bookinfo

```powershell
kubectl delete -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/gateway-api/bookinfo-gateway.yaml
kubectl delete -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/platform/kube/bookinfo-versions.yaml
kubectl delete -f https://raw.githubusercontent.com/istio/istio/1.31.1/samples/bookinfo/platform/kube/bookinfo.yaml
```

### Remove Kiali

```powershell
kubectl delete -f $kialiManifest
```

### Remove Ambient Mode and Istio

```powershell
kubectl label namespace default istio.io/dataplane-mode-
istioctl uninstall --purge -y
kubectl delete namespace istio-system
```

### Remove Prometheus

```powershell
helm uninstall prom -n monitoring
```

### Delete the Exercise Cluster

If the cluster was created specifically for this exercise, remove it:

```powershell
k3d cluster delete istio
```

Deleting the dedicated cluster also removes its remaining Kubernetes workloads and configuration.

## Exercise Outcome

This exercise demonstrates how Istio Ambient Mode provides service mesh functionality without modifying application code or injecting sidecar proxies.

The Bookinfo application demonstrates communication between microservices, while Prometheus and Kiali provide tools for monitoring and visualizing network traffic.
