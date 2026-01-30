"use client";

import { useRealtimeUser } from "@/hooks/useRealtime";
import Link from "next/link";
import { Environment } from "@terragon/shared";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { EnvironmentVariablesEditor } from "@/components/environments/environment-variables-editor";
import { McpConfigEditor } from "@/components/environments/mcp-config-editor";
import { updateEnvironmentVariables } from "@/server-actions/environment-variables";
import { updateMcpConfig } from "@/server-actions/mcp-config";
import { toast } from "sonner";
import { usePageBreadcrumbs } from "@/hooks/usePageBreadcrumbs";
import { McpConfig } from "@terragon/sandbox/mcp-config";
import { Button } from "@/components/ui/button";
import { FileCog } from "lucide-react";
import { CreateEnvironmentButton } from "@/components/environments/create-environment-button";
import { DeleteEnvironmentButton } from "@/components/environments/delete-environment-button";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { publicDocsUrl } from "@terragon/env/next-public";
import { usePageHeader } from "@/contexts/page-header";
import { Portal } from "@radix-ui/react-portal";
import { useServerActionMutation } from "@/queries/server-action-helpers";

function EnvironmentBreadcrumb({ label }: { label: string | null }) {
  usePageBreadcrumbs([
    { label: "Environments", href: "/environments" },
    ...(label ? [{ label }] : []),
  ]);
  return null;
}

export function Environments({
  environments,
}: {
  environments: Environment[];
}) {
  const router = useRouter();
  const { headerActionContainer } = usePageHeader();
  usePageBreadcrumbs([{ label: "Environments" }]);
  useRealtimeUser({
    matches: (message) => !!message.data.environmentId,
    onMessage: () => router.refresh(),
  });

  return (
    <>
      <Portal container={headerActionContainer}>
        <CreateEnvironmentButton />
      </Portal>
      <div className="flex flex-col justify-start h-full w-full max-w-4xl">
        <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            About Sandbox Environments
          </h3>
          <p className="text-sm text-muted-foreground">
            Terragon runs in an isolated Linux environment with full development
            capabilities. Each sandbox includes Node.js, Python, Git, and common
            development tools.
            <br />
            <br />
            <Link
              href={`${publicDocsUrl()}/docs/configuration/environment-setup/sandbox`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Learn more about the sandbox environment
            </Link>
          </p>
        </div>
        <div className="space-y-2 pb-6 mb-4">
          <div className="border-b pb-2">
            <h2 className="text-lg font-semibold">Global</h2>
            <p className="text-sm text-muted-foreground">
              Manage environment variables that apply to all your repositories.
            </p>
          </div>
          <Link className="underline" href="/environments/global">
            Manage
          </Link>
        </div>
        <div className="space-y-2 pb-6">
          <div className="border-b pb-2">
            <h2 className="text-lg font-semibold">Repository Specific</h2>
            {environments?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Click "Create Environment" to get started
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Manage environment variables and MCP servers for specific
                repositories.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4 w-full">
            {environments?.map((environment) => (
              <Link
                className="underline"
                href={`/environments/${environment.id}`}
                key={environment.id}
              >
                {environment.repoFullName}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function EnvironmentVariablesSection({
  environmentId,
  environmentVariables,
  globalEnvironmentVariableKeys,
  onDirtyChange,
}: {
  environmentId: string;
  environmentVariables: Array<{ key: string; value: string }>;
  globalEnvironmentVariableKeys: string[];
  onDirtyChange: (isDirty: boolean) => void;
}) {
  const router = useRouter();
  const [envVars, setEnvVars] = useState(environmentVariables);
  const updateEnvironmentVariablesMutation = useServerActionMutation({
    mutationFn: updateEnvironmentVariables,
    onSuccess: (_, { variables }) => {
      setEnvVars(variables);
      onDirtyChange(false); // Reset dirty state after successful save
      toast.success("Environment variables saved successfully");
      router.refresh();
    },
  });
  return (
    <div className="flex flex-col gap-2 mt-6">
      <h2 className="text-base font-medium text-muted-foreground">
        Environment Variables
      </h2>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Configure environment variables that will be available in your sandbox
          environments. All environment variables are encrypted at rest and in
          transit for optimal security.{" "}
          <Link
            href={`${publicDocsUrl()}/docs/configuration/environment-setup/environment-variables`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Learn more about environment variables
          </Link>
          .
        </span>
        <EnvironmentVariablesEditor
          variables={envVars}
          globalEnvironmentVariableKeys={globalEnvironmentVariableKeys}
          onChange={async (variables) => {
            await updateEnvironmentVariablesMutation.mutateAsync({
              environmentId,
              variables,
            });
          }}
          onDirtyChange={onDirtyChange}
          disabled={updateEnvironmentVariablesMutation.isPending}
        />
      </div>
    </div>
  );
}

export function EnvironmentUI({
  environmentId,
  environment,
  environmentVariables,
  globalEnvironmentVariableKeys,
  mcpConfig,
}: {
  environmentId: string;
  environment: Pick<Environment, "repoFullName">;
  environmentVariables: Array<{ key: string; value: string }>;
  globalEnvironmentVariableKeys: string[];
  mcpConfig?: McpConfig;
}) {
  const router = useRouter();
  const [mcpConfigState, setMcpConfigState] = useState(
    mcpConfig || { mcpServers: {} },
  );
  const [envVarsDirty, setEnvVarsDirty] = useState(false);
  const [mcpConfigDirty, setMcpConfigDirty] = useState(false);
  const { headerActionContainer } = usePageHeader();

  const hasUnsavedChanges = envVarsDirty || mcpConfigDirty;

  // Use custom hook for navigation warnings
  useUnsavedChangesWarning(hasUnsavedChanges);

  useRealtimeUser({
    matches: useCallback(
      (args) => {
        return (
          args.type === "user" && args.data.environmentId === environmentId
        );
      },
      [environmentId],
    ),
    onMessage: useCallback(() => {
      router.refresh();
    }, [router]),
  });

  const updateMcpConfigMutation = useServerActionMutation({
    mutationFn: updateMcpConfig,
    onSuccess: (_, { mcpConfig }) => {
      setMcpConfigState(mcpConfig);
      setMcpConfigDirty(false); // Reset dirty state after successful save
      toast.success("MCP configuration saved successfully");
      router.refresh();
    },
  });

  if (!environment) {
    return null;
  }
  return (
    <div className="flex flex-col justify-start h-full w-full max-w-4xl">
      <Portal container={headerActionContainer}>
        <DeleteEnvironmentButton
          environmentId={environmentId}
          repoFullName={environment.repoFullName}
        />
      </Portal>
      <EnvironmentBreadcrumb label={environment.repoFullName} />
      <div className="flex flex-col gap-4 w-full pb-4">
        <EnvironmentVariablesSection
          environmentId={environmentId}
          environmentVariables={environmentVariables}
          globalEnvironmentVariableKeys={globalEnvironmentVariableKeys}
          onDirtyChange={setEnvVarsDirty}
        />
        <div className="flex flex-col gap-2 mt-10">
          <h2 className="text-base font-medium text-muted-foreground">
            MCP Server Configuration
          </h2>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              Configure custom Model Context Protocol ("MCP") servers that will
              be available to Terragon. Learn more about which formats are
              supported with each agent{" "}
              <Link
                href={`${publicDocsUrl()}/docs/configuration/mcp-setup`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                in our documentation
              </Link>
              .
            </span>
            <McpConfigEditor
              value={mcpConfigState}
              onChange={async (config) => {
                await updateMcpConfigMutation.mutateAsync({
                  environmentId,
                  mcpConfig: config,
                });
              }}
              onDirtyChange={setMcpConfigDirty}
              disabled={updateMcpConfigMutation.isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-10 mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-muted-foreground">
              Environment Setup
            </h2>
            <Link href={`/environments/${environmentId}/setup`}>
              <Button variant="outline" size="sm" className="text-xs">
                <FileCog className="h-4 w-4 mr-1" />
                Edit Setup Script
              </Button>
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              Configure custom setup commands that run when your environment
              starts. You can either configure an environment-specific script in
              the settings or add a{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                terragon-setup.sh
              </code>{" "}
              file to your repository. Environment scripts take precedence over
              repository scripts.{" "}
              <Link
                href={`${publicDocsUrl()}/docs/configuration/environment-setup/setup-scripts`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                Learn more about setup scripts
              </Link>
              .
            </span>
          </div>
          <div className="bg-muted/50 p-3 rounded-md">
            <p className="text-xs text-muted-foreground mb-2">Example:</p>
            <code className="text-xs text-foreground block">
              #!/bin/bash
              <br />
              npm install
              <br />
              pip install -r requirements.txt
              <br />
              ./my-custom-setup.sh
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlobalEnvironmentUI({
  environmentId,
  environmentVariables,
}: {
  environmentId: string;
  environmentVariables: Array<{ key: string; value: string }>;
}) {
  const [envVarsDirty, setEnvVarsDirty] = useState(false);
  const hasUnsavedChanges = envVarsDirty;
  useUnsavedChangesWarning(hasUnsavedChanges);

  return (
    <div className="flex flex-col justify-start h-full w-full max-w-4xl">
      <EnvironmentBreadcrumb label="Global" />
      <p>The global environment applies to all your repositories.</p>
      <EnvironmentVariablesSection
        environmentId={environmentId}
        environmentVariables={environmentVariables}
        globalEnvironmentVariableKeys={[]}
        onDirtyChange={setEnvVarsDirty}
      />
    </div>
  );
}
