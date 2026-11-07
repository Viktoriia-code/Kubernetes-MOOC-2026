# Exercise 4.9 - The project, step 25

> Enhance the Project setup as follows
> 
> * Create two separate environments, production and staging that are in their own namespaces
> * Each commit to the main branch should result in deployment to the staging environment
> * Each tagged commit results in deployment to the production environment
> * In staging the broadcaster just logs all the messages, it does not forward those to any external service
> * In staging database is not backed up
> * You may assume that secrets are readily applied outside of the ArgoCD

## Overview

This exercise extends the Todo Project by introducing two separate Kubernetes environments, staging and production, managed using Argo CD and Kustomize.

The goal is to automate deployments based on Git events while maintaining independent configurations for each environment.

## Environment Configuration

Both environments run in separate Kubernetes namespaces and include the Todo App, Todo Backend, Todo Broadcaster, and PostgreSQL database.

| Feature | Staging | Production |
|---------|---------|------------|
| Namespace | `staging` | `production` |
| Deployment trigger | Commit to `main` | Git tag |
| Argo CD Application | `todo-project-staging` | `todo-project-production` |
| Broadcaster | Logs messages only | Forwards messages to Discord |
| Database backups | Disabled | Enabled |
| Secrets | Managed outside Argo CD | Managed outside Argo CD |

## Project Structure

Kustomize is used to share common Kubernetes resources while maintaining separate configurations for each environment.

```text
environments/
├── base/
│   └── kustomization.yaml
└── overlays/
    ├── staging/
    │   ├── kustomization.yaml
    │   ├── broadcaster-patch.yaml
    │   ├── remove-backup-cronjob.yaml
    │   └── namespace.yaml
    └── production/
        ├── kustomization.yaml
        ├── broadcaster-patch.yaml
        └── namespace.yaml
```

The `base` directory contains shared Kubernetes manifests, while the overlays define environment specific configurations.

## Argo CD Applications

The Argo CD Application definitions are stored in [`../argocd/applications/`](../argocd/applications/).

Staging uses an explicit branch reference:

```yaml
targetRevision: refs/heads/main
```

Production uses a semver constraint:

```yaml
targetRevision: ">=4.9.0"
```

Therefore, commits to `main` are eligible for staging, while only Git tags matching the production constraint are eligible for production. Both Applications use automated sync, pruning, self-healing, and `CreateNamespace=true`.

Apply the Applications with:

```powershell
kubectl apply -f ../argocd/applications/staging.yaml
kubectl apply -f ../argocd/applications/production.yaml
```

Check their status:

```powershell
kubectl -n argocd get applications
```

## Image publishing and deployments

### Staging

Each application code commit to the `main` branch triggers [`.github/workflows/project-gitops.yaml`](../.github/workflows/project-gitops.yaml), which builds and publishes Docker images to Docker Hub.

Argo CD monitors the staging overlay and automatically synchronizes changes to the rendered Kubernetes resources.

The workflow currently publishes images but does not modify the Kustomize image tags. Publishing an image alone does not create a new Kubernetes rollout: the staging overlay must also receive a changed image tag, or an image-update controller must be installed and configured separately.

### Production

Production deployments are triggered by Git tags.

When a matching tagged commit is pushed, GitHub Actions builds and publishes Docker images using the Git tag as the image version. The production overlay must reference that image tag before Argo CD can deploy it.

Production uses release images to ensure that development builds are not deployed automatically.

## Broadcaster Configuration

The broadcaster behaves differently depending on the environment.

**Staging:**

Messages are written to the application logs without being forwarded to an external service.
<img width="872" height="217" alt="image" src="https://github.com/user-attachments/assets/5f46b40f-ce1c-4397-a65b-d83f7cf4352f" />

**Production:**

Messages are forwarded to a Discord webhook. The webhook URL is provided through a Kubernetes Secret managed outside Argo CD.
<img width="561" height="552" alt="image" src="https://github.com/user-attachments/assets/f20f8c83-d098-4111-a1b8-78c92206be01" />

## Database Backups

Database backups are disabled in staging to avoid unnecessary backup operations.

Production has database backups enabled to support data recovery.

## Tools and Technologies

* **Kubernetes:** Runs and isolates the application environments.
* **Kustomize:** Manages shared manifests and environment specific configurations.
* **GitHub Actions:** Builds and publishes Docker images.
* **Docker Hub:** Stores application images.
* **Argo CD:** Synchronizes Kubernetes resources with Git.

## Secrets

Secrets are intentionally not stored in Git and are not managed by Argo CD. Create them in each namespace before the workloads start:

```powershell
kubectl -n staging create secret generic todo-database-secret `
  --from-literal=postgres-password=YOUR_PASSWORD

kubectl -n production create secret generic todo-database-secret `
  --from-literal=postgres-password=YOUR_PASSWORD
kubectl -n production create secret generic todo-broadcaster-secret `
  --from-literal=broadcast-url=YOUR_WEBHOOK_URL
kubectl -n production create secret generic storage-sa-key `
  --from-file=key.json=..\todo_backend\key.json
```

Never commit webhook URLs, database passwords, or service-account keys.

## Validation

Render both overlays before applying changes:

```powershell
kubectl kustomize overlays/staging
kubectl kustomize overlays/production
```

Verify the environment-specific behavior:

```powershell
kubectl -n staging get deployments,cronjobs
kubectl -n production get deployments,cronjobs
kubectl -n staging logs deployment/todo-broadcaster --tail=50
```

Staging must not contain `todo-db-backup`; production must contain it. Existing bound PVCs must retain their original `storageClassName`, because Kubernetes does not allow changing that field after a claim is created.

## Result

The project has two independent Kubernetes environments with separate namespaces and configurations.

<img width="842" height="542" alt="image" src="https://github.com/user-attachments/assets/15e8d0b5-b661-4a03-9f90-b4e76fc108c8" />

Staging is configured to receive updates from the `main` branch, while production is configured to receive tagged releases.

The setup separates development and production behavior, supports automated deployments, and keeps sensitive configuration outside the Git repository.
