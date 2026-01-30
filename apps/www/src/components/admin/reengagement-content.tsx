"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { AccessCodeReengagement } from "./access-code-reengagement";
import { OnboardingCompletionReengagement } from "./onboarding-completion-reengagement";

export function ReengagementContent() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Re-engagement Campaigns</h1>

      <Tabs defaultValue="access-code" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="access-code">Access Code</TabsTrigger>
          <TabsTrigger value="onboarding-completion">
            Onboarding Completion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="access-code" className="mt-6">
          <AccessCodeReengagement />

          <Alert className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>About Access Code Campaign</AlertTitle>
            <AlertDescription>
              This campaign targets users with access codes that:
              <ul className="mt-2 list-disc pl-5">
                <li>Were created more than 2 days ago</li>
                <li>Have not been used yet</li>
                <li>Have not already received a re-engagement email</li>
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="onboarding-completion" className="mt-6">
          <OnboardingCompletionReengagement />

          <Alert className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>About Onboarding Completion Campaign</AlertTitle>
            <AlertDescription>
              This campaign targets users who:
              <ul className="mt-2 list-disc pl-5">
                <li>Have completed onboarding</li>
                <li>Created their account over 24 hours ago</li>
                <li>Have not created any tasks yet</li>
                <li>Have not already received this reminder email</li>
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
}
