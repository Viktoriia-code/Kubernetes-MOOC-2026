
# Exercise 5.6 - Trying serverless

## Task
> Deploy a serverless application using Knative Serving on Kubernetes, explore autoscaling, and configure traffic splitting between application revisions.

## 1. Cluster Setup

Created a k3d cluster with two worker nodes and Traefik disabled.

```powershell
k3d cluster create knative --port 8082:30080@agent:0 -p 8081:80@loadbalancer --agents 2 --k3s-arg "--disable=traefik@server:0" --image rancher/k3s:v1.34.1-k3s1
```

Installed Knative Serving and Kourier following the [official Knative documentation](https://knative.dev/docs/install/yaml-install/serving/install-serving-with-yaml/).

Checked the Knative components:

```powershell
kubectl get pods -n knative-serving
```

### Kubernetes Version Compatibility

Knative Serving 1.24 required Kubernetes 1.35, while the cluster was running Kubernetes 1.34.1. Several Knative components initially entered `CrashLoopBackOff`.

For this exercise, I bypassed the minimum Kubernetes version check:

```powershell
kubectl set env deployment/activator deployment/autoscaler deployment/controller deployment/webhook deployment/net-kourier-controller `
  -n knative-serving `
  KUBERNETES_MIN_VERSION=1.34.0
```

Verified that the Knative Deployments were running:

```powershell
kubectl get deployments -n knative-serving
```

**Screenshot:** Knative Deployments showing `READY 1/1`.

## 2. Deploying a Knative Service

Created a Knative Service named `hello` using `kubectl`, without installing the Knative CLI.

```powershell
@"
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: hello
spec:
  template:
    spec:
      containers:
        - image: ghcr.io/knative/helloworld-go:latest
          ports:
            - containerPort: 8080
          env:
            - name: TARGET
              value: World
"@ | kubectl apply -f -
```

Verified the service:

```powershell
kubectl get ksvc hello
kubectl get revisions
```

The service was created successfully with the first revision `hello-00001` and `READY=True`.

### Accessing the Application

The generated hostname initially used an internal Docker network IP address, which was not accessible directly from the Windows browser.

Updated the Knative domain configuration to use `localhost`:

```powershell
'{"data":{"localhost":""}}' | Set-Content -Path domain-patch.json -Encoding ascii

kubectl patch configmap config-domain -n knative-serving --type merge --patch-file domain-patch.json
```

Removed the previous domain configuration:

```powershell
'[{"op":"remove","path":"/data/172.20.0.3.sslip.io"}]' | Set-Content -Path remove-domain.json -Encoding ascii

kubectl patch configmap config-domain -n knative-serving --type=json --patch-file remove-domain.json
```

Started port forwarding through Kourier:

```powershell
kubectl port-forward -n kourier-system svc/kourier 8083:80
```

Application URL:

`http://hello.default.localhost:8083`

**Screenshot:** Hello World application in the browser.

## 3. Autoscaling

Knative Serving automatically manages application replicas based on incoming traffic.

Monitored the Pods:

```powershell
kubectl get pods -w
```

Generated requests:

```powershell
1..100 | ForEach-Object {
    curl.exe -s http://hello.default.localhost:8083
}
```

Checked the Deployment:

```powershell
kubectl get deployments
```

Observed the application running with one Pod containing two containers.

```text
NAME                                      READY   STATUS    RESTARTS
hello-00001-deployment-7494bd57d5-74q28   2/2     Running   0
```

Knative supports scaling application Pods to zero during inactivity and starting them again when requests arrive.

**Screenshot:** Pod and Deployment status during the autoscaling test.

## 4. Traffic Splitting

Created a second revision by changing the `TARGET` environment variable from `World` to `Knative`.

Created a patch file:

```powershell
'{"spec":{"template":{"spec":{"containers":[{"image":"ghcr.io/knative/helloworld-go:latest","ports":[{"containerPort":8080}],"env":[{"name":"TARGET","value":"Knative"}]}]}}}}' | Set-Content -Path revision-patch.json -Encoding ascii
```

Applied the patch:

```powershell
kubectl patch ksvc hello --type merge --patch-file revision-patch.json
```

Checked the revisions:

```powershell
kubectl get revisions
```

Configured traffic distribution:

| Revision | Response | Traffic |
|---|---|---|
| `hello-00001` | Hello World! | 50% |
| `hello-00002` | Hello Knative! | 50% |

Created the traffic configuration:

```powershell
@'
{
  "spec": {
    "traffic": [
      {
        "revisionName": "hello-00001",
        "percent": 50
      },
      {
        "revisionName": "hello-00002",
        "percent": 50
      }
    ]
  }
}
'@ | Set-Content -Path traffic-patch.json -Encoding ascii
```

Applied the configuration:

```powershell
kubectl patch ksvc hello --type merge --patch-file traffic-patch.json
```

Verified the traffic settings:

```powershell
kubectl get ksvc hello -o yaml
```

Sent multiple requests to test traffic distribution:

```powershell
1..20 | ForEach-Object {
    curl.exe -s http://hello.default.localhost:8083
}
```

The two revisions were configured to receive equal shares of incoming traffic.

**Screenshot:** Traffic splitting configuration and responses from both revisions.
