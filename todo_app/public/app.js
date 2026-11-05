const form = document.getElementById('todo-form');
const input = document.getElementById('todo-content');
const todos = document.getElementById('todos');
const error = document.getElementById('error');
const breakButton = document.getElementById('break-app');
let todoMaxLength;

function renderTodos(items) {
    todos.replaceChildren(...items.map((todo) => {
    const item = document.createElement('li');
    const content = document.createElement('span');
    content.className = todo.done ? 'todo-content done' : 'todo-content';
    const urlMatch = todo.content.match(/^(.*?)(https?:\/\/\S+)$/);
    if (!urlMatch) {
        content.textContent = todo.content;
    } else {
        content.append(document.createTextNode(urlMatch[1]));
        const link = document.createElement('a');
        link.href = urlMatch[2];
        link.textContent = urlMatch[2];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        content.append(link);
    }

    item.append(content);
    const status = document.createElement('button');
    status.className = todo.done ? 'todo-status completed' : 'todo-status';
    status.textContent = todo.done ? 'Done' : 'Mark done';
    status.type = 'button';
    status.disabled = todo.done;
    status.addEventListener('click', async () => {
        status.disabled = true;
        error.textContent = '';
        try {
            const response = await fetch(`/todos/${todo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: true }),
            });
            if (!response.ok) throw new Error(await response.text());
            await loadTodos();
        } catch (requestError) {
            status.disabled = false;
            error.textContent = requestError.message;
        }
    });
    item.append(status);
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
    if (!content) return;
    if (content.length > todoMaxLength) {
        error.textContent = `Todo content must be between 1 and ${todoMaxLength} characters`;
        return;
    }

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

breakButton.addEventListener('click', async () => {
    try {
        const response = await fetch('/break', { method: 'POST' });
        if (!response.ok) {
            throw new Error('Could not break the application');
        }
        window.location.assign('/');
    } catch (requestError) {
        error.textContent = requestError.message;
    }
});

async function loadConfiguration() {
    const response = await fetch('/config');
    if (!response.ok) throw new Error('Could not load configuration');
    const config = await response.json();
    todoMaxLength = config.todoMaxLength;
    input.placeholder = `Enter a new todo (max ${todoMaxLength} characters)`;
}

Promise.all([loadConfiguration(), loadTodos()]).catch((loadError) => {
    error.textContent = loadError.message;
});