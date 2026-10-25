const form = document.getElementById('todo-form');
const input = document.getElementById('todo-content');
const todos = document.getElementById('todos');
const error = document.getElementById('error');

function renderTodos(items) {
    todos.replaceChildren(...items.map((todo) => {
    const item = document.createElement('li');
    item.textContent = todo.content;
    return item;
    }));
}

async function loadTodos() {
    const response = await fetch('/todos');
    if (!response.ok) throw new Error('Could not load todos');
    renderTodos(await response.json());
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const content = input.value.trim();
    if (!content || content.length > 140) return;

    const response = await fetch('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
    });
    if (!response.ok) {
    error.textContent = await response.text();
    return;
    }
    input.value = '';
    await loadTodos();
});

loadTodos().catch((loadError) => {
    error.textContent = loadError.message;
});