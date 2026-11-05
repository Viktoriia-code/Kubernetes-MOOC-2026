# Exercise 4.5 - The project, step 22

## Task
> Speaking of updating. Our todo application could use "Done" field for todos that are already done. It should be a PUT request to `/todos/<id>`.

## Implementation

Each todo is displayed as a card with its content and a status button:

- New todos show a **Mark done** button.
- Clicking **Mark done** sends a `PUT` request to `/todos/<id>`.
- Successfully completed todos show a green **Done** label and their content is
  displayed with a strikethrough.
- Todo links are rendered as clickable links and open in a new browser tab.

The request body contains a JSON boolean:

```json
{ "done": true }
```

The backend validates that `done` is a boolean, updates the matching row in PostgreSQL, and returns the updated todo:

```json
{
  "id": 2,
  "content": "Deploy application to cluster",
  "done": true
}
```

The `GET /todos` response includes the `done` value for every todo, so the frontend can restore the correct status after loading or refreshing the page.
The `done` column is created with `DEFAULT FALSE`; startup migration also adds the column to an existing database without changing the existing todo content.
Therefore, completed states remain available after a page refresh, container restart, or Kubernetes pod replacement.

Invalid update requests are rejected with HTTP `400`, and an ID that does not exist returns HTTP `404`. If the update fails in the browser, the error is shown to the user and the todo status is not presented as completed.

## Important steps

<details>
<summary>Build and run the image locally</summary>

Build the image from the `todo_app` directory:

```powershell
docker build -t todo-app:local .
```

Start the app container on the same Docker network as the local backend:

```powershell
docker run -d --name todo-app --network todo-network -p 3001:3001 `
  -e PORT=3001 `
  -e IMAGE_URL=https://picsum.photos/1200 `
  -e CACHE_DIRECTORY=/app/data `
  -e CACHE_MAX_AGE_MS=600000 `
  -e TODO_BACKEND_URL=http://todo-backend:2345 `
  -e TODO_MAX_LENGTH=140 `
  todo-app:local
```

The app is available at `http://localhost:3001` and running in the background.

Stop the app:
```powershell
docker ps                    # Check running containers
docker logs todo-app         # View app logs
docker stop todo-app         # Stop the app
docker start todo-app       # Start it again
```

Remove the app container when finished:

```powershell
docker rm -f todo-app
```
</details>