"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateFeedbackStatus } from "@/server-actions/admin/feedback";
import { FeedbackType } from "@terragon/shared";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePageBreadcrumbs } from "@/hooks/usePageBreadcrumbs";
import Link from "next/link";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";

const feedbackTypeBadgeVariants: Record<
  FeedbackType,
  "default" | "destructive" | "secondary"
> = {
  bug: "destructive",
  feature: "secondary",
  feedback: "default",
};

type FeedbackWithUser = {
  id: string;
  userId: string;
  userName: string | null;
  type: FeedbackType;
  message: string;
  currentPage: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function AdminFeedback({
  feedbackList,
}: {
  feedbackList: FeedbackWithUser[];
}) {
  usePageBreadcrumbs([
    { label: "Admin", href: "/internal/admin" },
    { label: "Feedback" },
  ]);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FeedbackType | "all">("all");
  const [filterResolved, setFilterResolved] = useState<
    "all" | "resolved" | "unresolved"
  >("all");
  const [selectedFeedback, setSelectedFeedback] =
    useState<FeedbackWithUser | null>(null);

  const handleResolveToggle = async (feedbackId: string, resolved: boolean) => {
    try {
      await updateFeedbackStatus(feedbackId, resolved);
      router.refresh();
      toast.success(resolved ? "Marked as resolved" : "Marked as unresolved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update feedback status");
    }
  };

  const columns: ColumnDef<FeedbackWithUser>[] = [
    {
      id: "resolved",
      header: "Resolved",
      cell: ({ row }) => {
        const feedback = row.original;
        return (
          <Checkbox
            checked={feedback.resolved}
            onCheckedChange={(checked) =>
              handleResolveToggle(feedback.id, checked as boolean)
            }
          />
        );
      },
      size: 50,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue<FeedbackType>("type");
        return <Badge variant={feedbackTypeBadgeVariants[type]}>{type}</Badge>;
      },
      size: 100,
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => {
        const feedback = row.original;
        return (
          <button
            className="text-left hover:underline w-full block"
            onClick={() => setSelectedFeedback(feedback)}
          >
            <div className="truncate text-ellipsis overflow-hidden max-w-[400px]">
              {feedback.message}
            </div>
          </button>
        );
      },
    },
    {
      accessorKey: "currentPage",
      header: "Page",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.getValue("currentPage")}
        </span>
      ),
      size: 200,
    },
    {
      accessorKey: "userName",
      header: "User",
      cell: ({ row }) => {
        const feedback = row.original;
        return (
          <Link
            href={`/internal/admin/user/${feedback.userId}`}
            className="text-sm underline"
          >
            {feedback.userName || `${feedback.userId.slice(0, 8)}...`}
          </Link>
        );
      },
      size: 150,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground">
            {format(row.getValue<Date>("createdAt"), "MMM d, yyyy h:mm a zzz")}
          </span>
        );
      },
      size: 150,
    },
  ];

  const filteredFeedback = feedbackList.filter((feedback) => {
    // Filter by type
    if (filterType !== "all" && feedback.type !== filterType) {
      return false;
    }

    // Filter by resolved status
    if (filterResolved === "resolved" && !feedback.resolved) {
      return false;
    }
    if (filterResolved === "unresolved" && feedback.resolved) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        feedback.message.toLowerCase().includes(query) ||
        feedback.currentPage.toLowerCase().includes(query) ||
        feedback.userId.toLowerCase().includes(query) ||
        (feedback.userName?.toLowerCase() || "").includes(query)
      );
    }

    return true;
  });

  return (
    <div className="flex flex-col justify-start h-full w-full mx-auto">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search by message, page, user ID, or user name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />

          <Select
            value={filterType}
            onValueChange={(value) =>
              setFilterType(value as FeedbackType | "all")
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="bug">Bug Reports</SelectItem>
              <SelectItem value="feature">Feature Requests</SelectItem>
              <SelectItem value="feedback">General Feedback</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterResolved}
            onValueChange={(value) =>
              setFilterResolved(value as "all" | "resolved" | "unresolved")
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {filteredFeedback.length} of {feedbackList.length} feedback
          items
        </div>

        <DataTable columns={columns} data={filteredFeedback} />
      </div>

      <Dialog
        open={!!selectedFeedback}
        onOpenChange={(open) => !open && setSelectedFeedback(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <ScrollArea className="h-full pr-4 overflow-y-auto">
            {selectedFeedback && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Badge
                      variant={feedbackTypeBadgeVariants[selectedFeedback.type]}
                    >
                      {selectedFeedback.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {format(
                        selectedFeedback.createdAt,
                        "MMM d, yyyy h:mm a zzz",
                      )}
                    </span>
                  </DialogTitle>
                  <DialogDescription>
                    Submitted by{" "}
                    <a
                      href={`/internal/admin/user/${selectedFeedback.userId}`}
                      className="underline"
                    >
                      {selectedFeedback.userName || selectedFeedback.userId}
                    </a>
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div>
                    <h4 className="font-medium mb-1">Message</h4>
                    <div className="p-4 bg-muted rounded-md whitespace-pre-wrap">
                      {selectedFeedback.message}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-1">Page</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedFeedback.currentPage}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-1">Status</h4>
                    <p className="text-sm">
                      {selectedFeedback.resolved ? (
                        <span className="text-green-600">Resolved</span>
                      ) : (
                        <span className="text-yellow-600">Unresolved</span>
                      )}
                    </p>
                  </div>

                  <div className="flex justify-between pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleResolveToggle(
                          selectedFeedback.id,
                          !selectedFeedback.resolved,
                        );
                        setSelectedFeedback(null);
                      }}
                    >
                      Mark as{" "}
                      {selectedFeedback.resolved ? "Unresolved" : "Resolved"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedFeedback(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
