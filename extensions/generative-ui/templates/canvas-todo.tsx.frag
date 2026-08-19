import React from "react";
import { Button, H1, Row, Stack, Text, TodoListCard, useCanvasAction, useCanvasState } from "@gen-ui/canvas";

const INITIAL = [
  { id: "inspect", content: "Inspect the changed files", status: "completed" as const },
  { id: "test", content: "Run the focused test suite", status: "in_progress" as const },
  { id: "review", content: "Review the final diff", status: "pending" as const },
];

export default function TaskReview() {
  const [todos, setTodos] = useCanvasState("review-todos", INITIAL);
  const dispatch = useCanvasAction();
  const advance = (id: string) => setTodos((items) => items.map((item) => item.id === id ? { ...item, status: "completed" as const } : item));

  return (
    <Stack gap={14}>
      <Stack gap={4}>
        <H1>Review checklist</H1>
        <Text tone="secondary">Todo state persists locally for this canvas.</Text>
      </Stack>
      <TodoListCard todos={todos} defaultExpanded onTodoClick={(todo) => advance(todo.id)} />
      <Row gap={8}>
        <Button onClick={() => dispatch({ type: "openFile", path: "README.md" })}>Open README</Button>
      </Row>
    </Stack>
  );
}
