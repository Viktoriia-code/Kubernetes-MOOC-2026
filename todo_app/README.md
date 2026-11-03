# Exercise 4.2 - The project, step 21

## Task
> Create the required probes and endpoint for The Project to ensure that it's working and connected to a database.

## Health probes and application recovery

The project frontend now exposes three endpoints:

- `GET /healthz` is the liveness endpoint. It returns `200` during normal operation and `500` after the application is deliberately broken.
- `GET /readyz` is the readiness endpoint. It checks the backend health endpoint and returns `200` only when PostgreSQL is available.
- `POST /break` marks the frontend as unhealthy so the liveness probe can restart the pod.

The backend exposes `GET /healthz`, which runs `SELECT 1` against PostgreSQL. This endpoint is used by the backend readiness and liveness probes.

The probes were added in [`todo_app/manifests/deployment.yaml`](./manifests/deployment.yaml) and [`todo_backend/manifests/deployment.yaml`](../todo_backend/manifests/deployment.yaml):

```yaml
readinessProbe:
  httpGet:
    path: /readyz
    port: 3001
livenessProbe:
  httpGet:
    path: /healthz
    port: 3001
```

After deploying the project, click **Break the app** in the frontend. The frontend's liveness probe starts returning `500`, Kubernetes restarts the pod, and the application becomes healthy again:

```powershell
kubectl get pods -n project --watch
kubectl describe pod <todo-app-pod> -n project
kubectl logs -n project deployment/todo-app
```

The frontend pod should return to `1/1` in the `READY` column after the restart. Screenshots of the broken state and the recovered pod:

# Exercise 3.9 - DBaaS vs DIY

## Task

Do a pros/cons comparison of the solutions in terms of meaningful differences. This includes at least the required work and costs to initialize, as well as the maintenance. Backup methods and their ease of usage should be considered as well.

## Overview of the solutions

**Google Cloud SQL** is a managed PostgreSQL database service (DBaaS). Google provides the database infrastructure and handles much of its operation, while the application connects to it through a configured endpoint.

**Self-managed PostgreSQL** runs inside the GKE cluster, typically using a `StatefulSet`, `PersistentVolumeClaim`, and Kubernetes Service. The team owns the database infrastructure and its operation, including storage, upgrades, backups, and recovery.

## Google Cloud SQL (managed DBaaS)

### Pros

- **Quick setup:** An instance can be provisioned in minutes through the Google Cloud console or CLI.
- **Fully managed:** Google handles infrastructure maintenance, patching, upgrades, and managed backups.
- **High availability:** Regional instances can provide automated failover, reducing the impact of an instance failure.
- **Point-in-time recovery:** Automated backups and WAL-based recovery can be enabled without building a backup system from scratch.
- **Security and observability:** Cloud SQL integrates with IAM, private IP, Cloud Monitoring, and Cloud Logging.
- **Low operational overhead:** The team can focus on the application instead of running a database platform.

### Cons

- **Higher direct cost:** CPU, memory, storage, backups, network traffic, and high availability are billed separately.
- **Less control:** Cloud SQL does not provide unrestricted superuser access, and supported PostgreSQL extensions and configuration options are limited.
- **Vendor lock-in:** Networking, IAM, monitoring, and recovery workflows are closely tied to Google Cloud.
- **Upgrade coordination:** Major version upgrades still require planning and may require manual intervention or downtime depending on the operation.

## Self-managed PostgreSQL on GKE

This option uses Kubernetes resources such as a `StatefulSet`, Service, Secret, and `PersistentVolumeClaim`. A PostgreSQL operator such as CloudNativePG or Crunchy can automate parts of high availability, backups, and recovery, but the operator itself also needs to be installed and maintained.

### Pros

- **Full control:** PostgreSQL versions, configuration, extensions, and tuning can be selected for the workload.
- **Kubernetes-native operation:** The database uses the same deployment, storage, and CI/CD tooling as the rest of the application.
- **Portability:** Standard PostgreSQL and Kubernetes resources make migration between clouds or to on-premises infrastructure easier.
- **Flexible infrastructure costs:** Existing GKE capacity and open-source tooling may cost less than Cloud SQL for development or test workloads.
- **Custom storage and scaling:** The team chooses disk types, sizes, node pools, and resource limits.

### Cons

- **More complex initialization:** The team must configure manifests, storage, users, networking, and potentially an operator.
- **Full maintenance responsibility:** Upgrades, patching, tuning, monitoring, failover, and capacity planning are no longer delegated to Google.
- **Manual backup design:** Reliable `pg_dump`/`pg_restore`, WAL archiving, external storage, volume snapshots, and restore testing must be configured. A PVC protects against pod replacement, but is not a complete backup.
- **Security burden:** The team manages access control, encryption, secrets, network policies, and PostgreSQL security updates.
- **Higher production total cost of ownership:** Database administrators, SREs, and Kubernetes expertise may cost more than the infrastructure savings.
- **Failure risk without high availability:** A single PostgreSQL pod is a single point of failure unless replication and automated failover are implemented and tested.

## Recommendation

Cloud SQL is usually the better choice for mission-critical workloads, managed high availability, point-in-time recovery, fast setup, or teams without a dedicated database operations group. Self-managed PostgreSQL is reasonable for development and test environments, Kubernetes-native tooling, or workloads requiring deep PostgreSQL customization and portability. The apparent infrastructure savings of DIY should be compared with the ongoing cost of maintenance, backup implementation, incident response, and recovery testing.

| Use case | Recommended option |
|---|---|
| Fast setup with minimal operations | Google Cloud SQL |
| Mission-critical HA and PITR | Google Cloud SQL |
| No dedicated database operations team | Google Cloud SQL |
| Full PostgreSQL customization and tuning | PostgreSQL on GKE |
| Kubernetes-native database tooling | PostgreSQL on GKE |
| Lower-cost development or test environment | PostgreSQL on GKE |
