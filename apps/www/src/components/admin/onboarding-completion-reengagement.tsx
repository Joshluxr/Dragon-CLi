"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import {
  getOnboardingCompletionPreview,
  sendOnboardingCompletionEmails,
} from "@/server-actions/admin/email";
import { formatDistanceToNow } from "date-fns";

interface OnboardingRecipient {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

interface OnboardingPreviewData {
  recipients: OnboardingRecipient[];
  count: number;
}

interface SendResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

export function OnboardingCompletionReengagement() {
  const [previewData, setPreviewData] = useState<OnboardingPreviewData | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const handlePreview = async () => {
    setLoading(true);
    setSendResult(null);
    try {
      const data = await getOnboardingCompletionPreview();
      setPreviewData(data);
    } catch (error) {
      console.error("Failed to get onboarding preview:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmails = async () => {
    if (!previewData || previewData.count === 0) return;

    setSending(true);
    try {
      const result = await sendOnboardingCompletionEmails();
      setSendResult(result);
      // Refresh preview after sending
      handlePreview();
    } catch (error) {
      console.error("Failed to send onboarding emails:", error);
      setSendResult({
        success: false,
        sent: 0,
        failed: previewData.count,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Completion Reminder</CardTitle>
          <CardDescription>
            Send reminder emails to users who have completed onboarding over 24
            hours ago but haven't created any tasks yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              onClick={handlePreview}
              disabled={loading || sending}
              variant="outline"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Preview Recipients
                </>
              )}
            </Button>

            {previewData && previewData.count > 0 && (
              <Button
                onClick={handleSendEmails}
                disabled={sending}
                variant="default"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send to {previewData.count} Recipients
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {sendResult && (
        <Alert variant={sendResult.success ? "default" : "destructive"}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Email Campaign Results</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              <p>Successfully sent: {sendResult.sent}</p>
              {sendResult.failed > 0 && <p>Failed: {sendResult.failed}</p>}
              {sendResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">Errors:</p>
                  <ul className="list-disc pl-5">
                    {sendResult.errors.map((error, index) => (
                      <li key={index} className="text-sm">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              {previewData.count === 0
                ? "No eligible recipients found. All users who completed onboarding have either created tasks or already received reminder emails."
                : `Found ${previewData.count} user${previewData.count === 1 ? "" : "s"} who completed onboarding but haven't created any tasks.`}
            </CardDescription>
          </CardHeader>
          {previewData.count > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.recipients.map((recipient) => (
                    <TableRow key={recipient.id}>
                      <TableCell className="font-medium">
                        {recipient.name}
                      </TableCell>
                      <TableCell>{recipient.email}</TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(recipient.createdAt))} ago
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">No Tasks</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
