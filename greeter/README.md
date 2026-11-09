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

# Greeter

Greeter is a small Node.js HTTP service. A `GET /` request returns the value
of the `GREETING` environment variable, or `hello` by default.

## Run locally

```powershell
npm install
$env:GREETING = "hello"
node server.js
```

The service listens on port `3000`:

```powershell
curl.exe http://localhost:3000/
```

## Build the image

```powershell
docker build -t vikikone/greeter:v1 .
```

The Kubernetes deployment uses this image for two versions with different
greetings:

- v1: `hello from greeter v1`
- v2: `hello from greeter v2`
