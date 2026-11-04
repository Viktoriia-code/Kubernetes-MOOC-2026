# Exercise 4.3 - Prometheus

> Install and start Prometheus using Helm. Access the Prometheus GUI through Service port forwarding.
> 
> Write a PromQL query using kube_pod_info to count the Pods created by StatefulSets in the prometheus namespace.
> 
> Expected result: 3 Pods.

## Implementation

### 1. Install Prometheus

```powershell
kubectl create namespace prometheus

helm upgrade --install promstack prometheus-community/kube-prometheus-stack --version 91.2.3 --namespace prometheus --set prometheus.prometheusSpec.replicas=2 --set alertmanager.alertmanagerSpec.replicas=1
```

### 2. Verify StatefulSets

```powershell
kubectl get statefulsets -n prometheus
```

### 3. Access Prometheus

```powershell
kubectl port-forward svc/promstack-kube-prometheus-prometheus -n prometheus 9090:9090
```

Open http://localhost:9090.

### 4. Execute the PromQL query

```promql
sum(kube_pod_info{namespace="prometheus", created_by_kind="StatefulSet"})
```

## Result

**3 Pods** created by StatefulSets in the `prometheus` namespace.
<img width="772" height="365" alt="image" src="https://github.com/user-attachments/assets/bab6fa80-cacf-4f11-a490-e609fd5346e6" />
