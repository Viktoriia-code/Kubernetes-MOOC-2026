const form = document.getElementById('todo-form');
const input = document.getElementById('todo-content');
const todos = document.getElementById('todos');
const error = document.getElementById('error');
let todoMaxLength;

function renderTodos(items) {
    todos.replaceChildren(...items.map((todo) => {
    const item = document.createElement('li');
    const urlMatch = todo.content.match(/^(.*?)(https?:\/\/\S+)$/);
    if (!urlMatch) {
        item.textContent = todo.content;
        return item;
    }

    item.append(document.createTextNode(urlMatch[1]));
    const link = document.createElement('a');
    link.href = urlMatch[2];
    link.textContent = urlMatch[2];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
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
    if (!content || content.length > todoMaxLength) return;

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

async function loadConfiguration() {
    const response = await fetch('/config');
    if (!response.ok) throw new Error('Could not load configuration');
    const config = await response.json();
    todoMaxLength = config.todoMaxLength;
    input.maxLength = todoMaxLength;
    input.placeholder = `Enter a new todo (max ${todoMaxLength} characters)`;
}

Promise.all([loadConfiguration(), loadTodos()]).catch((loadError) => {
    error.textContent = loadError.message;
});