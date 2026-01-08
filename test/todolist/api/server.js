import express from 'express';

const app = express();
app.use(express.json());

const PORT = 3002;

let todos = [];
let nextId = 1;

const validateTodo = (body, isUpdate = false) => {
  const errors = [];

  if (!isUpdate && !body.title) {
    errors.push('title is required');
  }

  if (body.status && !['pending', 'completed'].includes(body.status)) {
    errors.push('status must be either "pending" or "completed"');
  }

  return errors;
};

app.get('/api/todos', (req, res) => {
  const { status } = req.query;
  let filteredTodos = todos;

  if (status) {
    filteredTodos = todos.filter(todo => todo.status === status);
  }

  res.json(filteredTodos);
});

app.get('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find(t => t.id === id);

  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  res.json(todo);
});

app.post('/api/todos', (req, res) => {
  const errors = validateTodo(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const todo = {
    id: nextId++,
    title: req.body.title,
    description: req.body.description || '',
    status: req.body.status || 'pending',
    createdAt: new Date().toISOString()
  };

  todos.push(todo);
  res.status(201).json(todo);
});

app.put('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find(t => t.id === id);

  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const errors = validateTodo(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  if (req.body.title !== undefined) todo.title = req.body.title;
  if (req.body.description !== undefined) todo.description = req.body.description;
  if (req.body.status !== undefined) todo.status = req.body.status;

  res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex(t => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  todos.splice(index, 1);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});