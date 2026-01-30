"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MultiTaskVisual() {
  const [columns, setColumns] = useState([
    {
      title: "Scheduled",
      tasks: [
        {
          id: 1,
          name: "Fix login bug",
          sandbox: "sb-a1b2c3",
          status: "Scheduled",
        },
      ],
    },
    {
      title: "In Progress",
      tasks: [
        {
          id: 2,
          name: "Add dark mode",
          sandbox: "sb-d4e5f6",
          status: "Running",
        },
        {
          id: 3,
          name: "Optimize queries",
          sandbox: "sb-g7h8i9",
          status: "Running",
        },
      ],
    },
    {
      title: "Ready",
      tasks: [
        { id: 4, name: "Update docs", sandbox: "sb-j0k1l2", status: "Ready" },
      ],
    },
  ]);

  const [draggedTask, setDraggedTask] = useState<{
    task: { id: number; name: string; sandbox: string; status: string };
    fromColumn: string;
  } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = (
    task: { id: number; name: string; sandbox: string; status: string },
    columnTitle: string,
  ) => {
    setDraggedTask({ task, fromColumn: columnTitle });
  };

  const handleDragOver = (e: React.DragEvent, columnTitle: string) => {
    e.preventDefault();
    setDragOverColumn(columnTitle);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the column entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !relatedTarget.closest(`[data-column]`)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, toColumnTitle: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask) {
      return;
    }

    setColumns((prevColumns) => {
      const newColumns = prevColumns.map((col) => ({
        ...col,
        tasks: [...col.tasks],
      }));
      const fromCol = newColumns.find(
        (c) => c.title === draggedTask.fromColumn,
      );
      const toCol = newColumns.find((c) => c.title === toColumnTitle);

      if (!fromCol || !toCol) return prevColumns;

      const taskIndex = fromCol.tasks.findIndex(
        (t) => t.id === draggedTask.task.id,
      );
      if (taskIndex === -1) return prevColumns;

      const [task] = fromCol.tasks.splice(taskIndex, 1);
      if (task) {
        // Update status based on column
        const statusMap: Record<string, string> = {
          Scheduled: "Scheduled",
          "In Progress": "Running",
          Ready: "Ready",
        };
        task.status = statusMap[toColumnTitle] || task.status;
        toCol.tasks.push(task);
      }

      return newColumns;
    });

    setDraggedTask(null);
  };

  return (
    <div className="mt-6 mx-0 w-full relative flex items-center justify-start lg:justify-center p-2">
      <div className="bg-background border border-border/50 rounded-lg shadow-lg p-4 w-fit relative">
        <div className="flex gap-3">
          {columns.map((column) => (
            <div
              key={column.title}
              data-column={column.title}
              className="flex-1 flex flex-col gap-2 w-32"
              onDragOver={(e) => handleDragOver(e, column.title)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.title)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {column.title}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {column.tasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="space-y-2 flex-1 min-h-[200px]">
                {column.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task, column.title)}
                    className={cn(
                      "bg-muted/30 border border-border/50 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing transition-opacity hover:shadow-md",
                      draggedTask?.task.id === task.id && "opacity-50",
                    )}
                  >
                    <div className="text-xs font-medium mb-2">{task.name}</div>
                    {/* Status */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <div
                        className={`size-1.5 rounded-full ${task.status === "Running" ? "bg-muted-foreground" : task.status === "Ready" ? "bg-green-600/90" : "bg-yellow-600/90"}`}
                      ></div>
                      <span className="text-xs text-muted-foreground">
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Drop zone at the end */}
                {draggedTask &&
                  dragOverColumn === column.title &&
                  draggedTask.fromColumn !== column.title && (
                    <div className="h-[60px] border-2 border-dashed border-primary/50 rounded-lg bg-primary/5" />
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* Add task button */}
        <div className="absolute bottom-3 right-3">
          <div className="size-8 rounded-full bg-primary flex items-center justify-center shadow-md">
            <PlusIcon className="size-4 text-primary-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
