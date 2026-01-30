"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/server-actions/feedback";
import { FeedbackType } from "@terragon/shared";
import { toast } from "sonner";
import { useServerActionMutation } from "@/queries/server-action-helpers";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [type, setType] = useState<FeedbackType>("feedback");
  const [message, setMessage] = useState("");
  const pathname = usePathname();
  const submitFeedbackMutation = useServerActionMutation({
    mutationFn: submitFeedback,
    onSuccess: () => {},
  });

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    await submitFeedbackMutation.mutateAsync({
      type,
      message,
      currentPage: pathname,
    });
    toast.success("Thank you for your feedback!");
    onOpenChange(false);
    // Reset form
    setMessage("");
    setType("feedback");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve by sharing your thoughts, reporting bugs, or
            suggesting features.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as FeedbackType)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feedback">General Feedback</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder={
                type === "bug"
                  ? "Please describe the issue you encountered..."
                  : type === "feature"
                    ? "What feature would you like to see?"
                    : "Share your thoughts with us..."
              }
              className="min-h-[120px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitFeedbackMutation.isPending}
          >
            {submitFeedbackMutation.isPending ? "Sending..." : "Send Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
