
# Exercise 5.4 - Wikipedia with Init and Sidecar Containers

## Task

> Deploy a Wikipedia application in Kubernetes using three containers:
> 
> - **Init container:** Downloads the Kubernetes Wikipedia page before Nginx starts.
> - **Nginx container:** Serves the downloaded HTML content.
> - **Sidecar container:** Waits a random 5 to 15 minutes, downloads a random Wikipedia page, and replaces the existing page.
> 
> All containers share an `emptyDir` volume mounted at `/usr/share/nginx/html`.

## Deployment

The application is deployed using **Kustomize**:

```powershell
kubectl apply -k .
```

Verify the deployment:

```powershell
kubectl get pods -l app=wikipedia
kubectl get svc wikipedia
```

## Access the Application

The application is exposed through a `ClusterIP` Service on port `80`.

Forward the Service to a local port:

```powershell
kubectl port-forward svc/wikipedia 8081:80
```

Open http://localhost:8081 in your browser.

## Verification

Check the init container logs:

```powershell
kubectl logs deployment/wikipedia -c wikipedia-init
```

Monitor the sidecar:

```powershell
kubectl logs deployment/wikipedia -c wikipedia-sidecar -f
```

<img width="783" height="auto" alt="Screenshot 2026-11-09 180355" src="https://github.com/user-attachments/assets/5bda0b87-534e-453d-a0f9-c070e71fd945" />

The sidecar logs its waiting time and reports successful page updates.

The downloaded HTML files use permissions `644`, allowing Nginx to read them.

## Result

The application initially serves the Kubernetes Wikipedia page. The sidecar periodically replaces it with a random Wikipedia article, demonstrating how init containers, sidecar containers, and shared volumes work together within a Kubernetes Pod.

<img width="1898" height="auto" alt="Screenshot 2026-11-09 180128" src="https://github.com/user-attachments/assets/a1b3b539-8be5-4b85-93d7-05647d960369" />
After 640 seconds:
<img width="1897" height="auto" alt="Screenshot 2026-11-09 181701" src="https://github.com/user-attachments/assets/2e810076-2dd0-499c-b1e9-ce48328b0da8" />
