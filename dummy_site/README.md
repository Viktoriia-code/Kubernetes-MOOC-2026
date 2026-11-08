# Exercise 5.1 - DIY CRD & Controller

## Task
> Create a Kubernetes DummySite custom resource with a website_url string property. Implement a controller that watches for DummySite resources and automatically creates the Kubernetes resources needed to serve a copy of the specified website.
> 
> Test the implementation using https://example.com/. The copied website should be accessible, but complex websites do not need to be reproduced perfectly.

## Application 

This project implements a Kubernetes Custom Resource Definition (CRD) and a custom controller that automatically creates a static copy of a website.

The `DummySite` resource accepts a website URL through `spec.website_url`. The controller retrieves the website's HTML and creates the Kubernetes resources needed to serve it using Nginx.

## How It Works

1. A user creates a `DummySite` custom resource containing a website URL.
2. The controller detects the resource through the Kubernetes API.
3. The controller downloads the website's HTML and attempts to include supported CSS and image assets.
4. The controller creates or updates three Kubernetes resources:
   - **ConfigMap:** Stores the downloaded HTML.
   - **Deployment:** Runs an Nginx container serving the HTML.
   - **Service:** Exposes the Nginx application inside the cluster.
5. The website becomes accessible through Kubernetes port forwarding.

The controller also processes existing `DummySite` resources on startup and watches for changes.

## Technologies

- Kubernetes
- Node.js
- Docker
- Nginx
- Kubernetes Custom Resource Definitions
- Kubernetes RBAC
- Kustomize

## Prerequisites

- A running Kubernetes cluster
- Docker
- kubectl
- Kustomize support through kubectl

This project was tested using a local k3d Kubernetes cluster.

## Deployment

### 1. Build and Push the Controller Image

From the `dummy_site` directory, build the Docker image:

```powershell
docker build -t vikikone/dummy-site-controller:1.0 -f controller/Dockerfile controller
```

Push the image to Docker Hub:

```powershell
docker push vikikone/dummy-site-controller:1.0
```

Alternatively, import the image directly into a local k3d cluster:

```powershell
k3d image import vikikone/dummy-site-controller:1.0 -c k3s-default
```

Ensure the controller Deployment references the same image tag.

### 2. Deploy the Controller

Apply the CRD, ServiceAccount, Role, RoleBinding, and controller Deployment:

```powershell
kubectl apply -k .
```

Wait until the controller is ready:

```powershell
kubectl rollout status deployment/dummy-site-controller-dep
```

Verify that the controller Pod is running:

```powershell
kubectl get pods
```

### 3. Create a DummySite Resource

Apply the example custom resource:

```powershell
kubectl apply -f examples/example-site.yaml
```

Example resource:

```yaml
apiVersion: stable.dwk/v1
kind: DummySite
metadata:
  name: example
spec:
  website_url: https://example.com/
```

Verify that Kubernetes recognizes the resource:

```powershell
kubectl get dummysites
```

### 4. Verify Generated Resources

The controller automatically creates the following resources:

| Resource | Name | Purpose |
|----------|------|---------|
| ConfigMap | `example-content` | Stores the website HTML |
| Deployment | `example-site` | Runs the Nginx server |
| Service | `example-site` | Exposes the website |

Check the generated resources:

```powershell
kubectl get deployments,services,configmaps -l dummy-site=example
```

Wait for the website Deployment:

```powershell
kubectl rollout status deployment/example-site
```

### 5. Access the Website

Forward the Service port to your local machine:

```powershell
kubectl port-forward service/example-site 8080:80
```

Open the website in your browser:

http://localhost:8080

The page displays the HTML copied from https://example.com/.

## Controller Functionality

The controller communicates directly with the Kubernetes API using Node.js.

Its main responsibilities include:

- Listing existing `DummySite` resources when starting.
- Watching for newly created and modified resources.
- Downloading HTML from the specified website.
- Attempting to include small external CSS files and images.
- Creating or updating ConfigMaps, Deployments, and Services.
- Reconnecting to the Kubernetes API when a watch connection ends.
- Assigning owner references to generated resources.

### Resource Ownership

All generated resources have an `ownerReference` pointing to the corresponding `DummySite`.

When the `DummySite` is deleted, Kubernetes garbage collection removes its dependent resources.

### RBAC Permissions

The controller uses a dedicated ServiceAccount:

`dummy-site-controller-account`

A namespace scoped Role and RoleBinding grant the controller permission to:

- Read and watch `DummySite` resources.
- Create, read, list, watch, and update ConfigMaps.
- Create, read, list, watch, and update Deployments.
- Create, read, list, watch, and update Services.

By default, the controller operates in the `default` namespace.

The namespace can be configured through the `CONTROLLER_NAMESPACE` environment variable, provided the corresponding RBAC permissions are configured.

## Troubleshooting

### Check Controller Logs

```powershell
kubectl logs deployment/dummy-site-controller-dep
```

### Check Resource Status

```powershell
kubectl get dummysites,deployments,services,configmaps
```

### Check Controller Permissions

```powershell
kubectl auth can-i watch dummysites.stable.dwk --as=system:serviceaccount:default:dummy-site-controller-account -n default
```

The expected result is `yes`.

### ImagePullBackOff

If the controller cannot pull its Docker image, verify that the image exists and is accessible to the cluster.

For a local k3d cluster, the image can also be imported directly:

```powershell
k3d image import vikikone/dummy-site-controller:1.0 -c k3s-default
```

### Website Is Not Created

Check the controller logs and verify that the controller has permission to create Kubernetes resources.

Also confirm that the `DummySite` resource contains a valid `website_url`.

## Limitations

The controller is designed for educational purposes and simple static websites.

- JavaScript executed by the original website is not reproduced.
- Some external assets may not be copied correctly.
- Large HTML documents and assets are restricted by size limits.
- Complex websites may have missing styles or functionality.
- The controller does not implement a full website crawler.
- Additional security controls would be required for production use.

## Cleanup

Delete the example resource:

```powershell
kubectl delete -f examples/example-site.yaml
```

Kubernetes garbage collection removes the generated ConfigMap, Deployment, and Service.

To remove the controller and its Kubernetes configuration:

```powershell
kubectl delete -k .
```

## Exercise Outcome

This exercise demonstrates how Kubernetes functionality can be extended through custom resources and controllers.

The **CRD** defines a new Kubernetes resource type called `DummySite`, while the **controller** implements the logic that transforms a website URL into a running application.

It also demonstrates Kubernetes API interaction, RBAC authorization, resource reconciliation, owner references, and automated resource management.