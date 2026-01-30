"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}) {
  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Delete Task"
      description="Are you sure you want to delete this task? This action cannot be undone."
      isLoading={isLoading}
    />
  );
}

export function AutomationDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}) {
  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Delete Automation"
      description="Are you sure you want to delete this automation? This action cannot be undone."
      isLoading={isLoading}
    />
  );
}
