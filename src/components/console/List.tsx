// List — empty-state aware list wrapper for consoles.

import React from "react";

export interface ListProps<T> {
  items: T[];
  emptyMessage?: string;
  render: (item: T) => React.ReactNode;
  testId?: string;
}

export function List<T>({ items, emptyMessage = "Empty", render, testId }: ListProps<T>) {
  if (items.length === 0) {
    return (
      <p
        className="font-mono text-muted-foreground"
        style={{ fontSize: "12px" }}
        data-testid={testId ? `${testId}-empty` : undefined}
      >
        {emptyMessage}
      </p>
    );
  }
  return <div data-testid={testId}>{items.map(render)}</div>;
}
