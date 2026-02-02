"use client";

import { useAtomValue } from "jotai";
import {
  userAtom,
  allAgentsAtom,
  userSettingsAtom,
  useUpdateUserSettingsMutation,
} from "@/atoms/user";
import { CredentialsList } from "@/components/credentials/credentials-list";
import {
  AddClaudeCredentialDialog,
  AddCodexCredentialDialog,
  AddAmpCredentialDialog,
  AddGeminiCredentialDialog,
  AddKimiCredentialDialog,
  AddGlmCredentialDialog,
} from "@/components/credentials/add-credential-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SettingsSection, SettingsWithCTA } from "../settings-row";
import { AIAgent, AIModel } from "@dragon/agent/types";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getModelInfo,
  getAgentInfo,
  getAgentDisplayName,
  isAgentEnabledByDefault,
  agentToModels,
  getModelDisplayName,
  isModelEnabledByDefault,
  isConnectedCredentialsSupported,
} from "@dragon/agent/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentIcon } from "@/components/chat/agent-icon";
import { cn } from "@/lib/utils";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useCredentials } from "@/queries/credentials-queries";
import { ClaudeApiOverrideMetadata } from "@dragon/shared/db/types";
import { useMemo } from "react";

export function AgentSettings() {
  const user = useAtomValue(userAtom);
  const userSettings = useAtomValue(userSettingsAtom);
  if (!user || !userSettings) {
    return null;
  }
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        label="Agent Configuration"
        description="Customize how the coding agent behaves across all your tasks"
      >
        <CustomSystemPromptSetting />
      </SettingsSection>
      <AgentAndModelsEnabledSection />
      <AgentProvidersSection />
    </div>
  );
}

type OpencodeProvider = "kimi" | "glm";

function AgentProvidersSection() {
  const allAgents = useAtomValue(allAgentsAtom);
  const agents = allAgents.filter((agent) => {
    return isConnectedCredentialsSupported(agent);
  });
  const [selectProviderOpen, setSelectProviderOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [opencodeProviderSelectOpen, setOpencodeProviderSelectOpen] =
    useState(false);
  const [selectedOpencodeProvider, setSelectedOpencodeProvider] =
    useState<OpencodeProvider | null>(null);

  const handleAgentSelect = (agent: AIAgent) => {
    if (agent === "opencode") {
      // For opencode, show sub-selector for Kimi vs GLM
      setSelectProviderOpen(false);
      setOpencodeProviderSelectOpen(true);
    } else {
      setSelectedAgent(agent);
      setSelectProviderOpen(false);
      setCredentialDialogOpen(true);
    }
  };

  const handleOpencodeProviderSelect = (provider: OpencodeProvider) => {
    setSelectedOpencodeProvider(provider);
    setOpencodeProviderSelectOpen(false);
    setCredentialDialogOpen(true);
  };

  const addCredentialCTA = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setSelectProviderOpen(true)}
    >
      <Plus className="h-4 w-4" />
      Add Credential
    </Button>
  );

  return (
    <div id="agent-providers">
      <SettingsSection
        label="Agent Providers"
        description="Connect your existing subscriptions to power your coding agents"
        cta={addCredentialCTA}
      >
        <CredentialsList />
      </SettingsSection>
      <SelectProviderDialog
        open={selectProviderOpen}
        onOpenChange={setSelectProviderOpen}
        agents={agents}
        onSelect={handleAgentSelect}
      />
      <SelectOpencodeProviderDialog
        open={opencodeProviderSelectOpen}
        onOpenChange={setOpencodeProviderSelectOpen}
        onSelect={handleOpencodeProviderSelect}
      />
      {selectedAgent === "claudeCode" && (
        <AddClaudeCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedAgent(null);
            }
          }}
        />
      )}
      {selectedAgent === "codex" && (
        <AddCodexCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedAgent(null);
            }
          }}
        />
      )}
      {selectedAgent === "amp" && (
        <AddAmpCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedAgent(null);
            }
          }}
        />
      )}
      {selectedAgent === "gemini" && (
        <AddGeminiCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedAgent(null);
            }
          }}
        />
      )}
      {selectedOpencodeProvider === "kimi" && (
        <AddKimiCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedOpencodeProvider(null);
            }
          }}
        />
      )}
      {selectedOpencodeProvider === "glm" && (
        <AddGlmCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            setCredentialDialogOpen(open);
            if (!open) {
              setSelectedOpencodeProvider(null);
            }
          }}
        />
      )}
    </div>
  );
}

function SelectProviderDialog({
  open,
  onOpenChange,
  agents,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AIAgent[];
  onSelect: (agent: AIAgent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Credential</DialogTitle>
          <DialogDescription>
            Choose which agent provider you'd like to add credentials for.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {agents.map((agent) => (
            <Button
              key={agent}
              variant="outline"
              className="w-full justify-start flex items-center gap-2 px-4 h-fit"
              onClick={() => onSelect(agent)}
            >
              <AgentIcon agent={agent} sessionId={null} />
              <span>{getAgentDisplayName(agent)}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectOpencodeProviderDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (provider: OpencodeProvider) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>OpenCode Provider</DialogTitle>
          <DialogDescription>
            Choose which OpenCode provider you'd like to add credentials for.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Button
            variant="outline"
            className="w-full justify-start flex items-center gap-2 px-4 h-fit"
            onClick={() => onSelect("kimi")}
          >
            <AgentIcon agent="opencode" sessionId={null} />
            <span>Kimi (Moonshot)</span>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start flex items-center gap-2 px-4 h-fit"
            onClick={() => onSelect("glm")}
          >
            <AgentIcon agent="opencode" sessionId={null} />
            <span>GLM (Zhipu AI)</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomSystemPromptSetting() {
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  const [customSystemPrompt, setCustomSystemPrompt] = useState(
    userSettings?.customSystemPrompt || "",
  );
  const handleChange = (newValue: string) => {
    setCustomSystemPrompt(newValue);
    setHasChanges(true);
  };
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setHasChanges(false);
      await userSettingsMutation.mutateAsync({ customSystemPrompt });
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <SettingsWithCTA label="Custom System Prompt" direction="col">
      <div className="flex flex-col gap-2 w-full">
        <Textarea
          value={customSystemPrompt}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Eg. Always use descriptive variable names..."
          className="min-h-48"
        />
        <Button
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
          size="sm"
          className="self-start"
        >
          Save Changes
        </Button>
      </div>
    </SettingsWithCTA>
  );
}

function useAgentAndModelsEnabledSection() {
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  const agentPreferences = userSettings?.agentModelPreferences?.agents || {};
  const modelPreferences = userSettings?.agentModelPreferences?.models || {};
  const updateAgentPreference = async (agent: AIAgent, enabled: boolean) => {
    await userSettingsMutation.mutateAsync({
      agentModelPreferences: {
        ...userSettings?.agentModelPreferences,
        agents: {
          ...userSettings?.agentModelPreferences?.agents,
          [agent]: enabled,
        },
      },
    });
  };
  const updateModelPreference = async (model: AIModel, enabled: boolean) => {
    await userSettingsMutation.mutateAsync({
      agentModelPreferences: {
        ...userSettings?.agentModelPreferences,
        models: {
          ...userSettings?.agentModelPreferences?.models,
          [model]: enabled,
        },
      },
    });
  };

  return {
    agentPreferences,
    modelPreferences,
    updateAgentPreference,
    updateModelPreference,
  };
}

function AgentAndModelsEnabledSection() {
  const allAgents = useAtomValue(allAgentsAtom);
  const { agentPreferences, updateAgentPreference } =
    useAgentAndModelsEnabledSection();
  return (
    <div id="available-agents-and-models">
      <SettingsSection
        label="Available Agents & Models"
        description="Choose which agents and models are available when you create a new task"
      >
        <div className="space-y-4">
          {allAgents.map((agent) => {
            const isEnabled =
              agentPreferences[agent] ?? isAgentEnabledByDefault(agent);
            return (
              <AgentModelItem
                key={agent}
                agent={agent}
                isEnabled={isEnabled}
                onToggle={(enabled) => updateAgentPreference(agent, enabled)}
              />
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}

function AgentModelItem({
  agent,
  isEnabled,
  onToggle,
}: {
  agent: AIAgent;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const openCodeOpenAIAnthropicModel = useFeatureFlag(
    "opencodeOpenAIAnthropicModelOption",
  );
  const openCodeGemini3ProModel = useFeatureFlag(
    "opencodeGemini3ProModelOption",
  );

  // Check for Kimi/GLM credentials
  const { data: credentials } = useCredentials();
  const { hasKimiCredentials, hasGlmCredentials } = useMemo(() => {
    const opencodeCredentials = credentials?.opencode ?? [];
    let hasKimi = false;
    let hasGlm = false;
    for (const cred of opencodeCredentials) {
      const metadata = cred.metadata as ClaudeApiOverrideMetadata | null;
      if (metadata?.type === "claude-api-override") {
        if (metadata.provider === "kimi") hasKimi = true;
        if (metadata.provider === "glm") hasGlm = true;
      }
    }
    return { hasKimiCredentials: hasKimi, hasGlmCredentials: hasGlm };
  }, [credentials]);

  const models = agentToModels(agent, {
    agentVersion: "latest",
    enableOpenRouterOpenAIAnthropicModel: openCodeOpenAIAnthropicModel,
    enableOpencodeGemini3ProModelOption: openCodeGemini3ProModel,
    hasKimiCredentials,
    hasGlmCredentials,
  });
  const agentLabel = getAgentDisplayName(agent);
  const agentInfo = getAgentInfo(agent);

  return (
    <div
      className={cn("grid grid-cols-[auto_1fr_auto] gap-3", {
        "opacity-75": !isEnabled,
      })}
    >
      <div className="mt-0.5">
        <AgentIcon agent={agent} sessionId={null} />
      </div>
      <div>
        <p className="text-sm font-medium">{agentLabel}</p>
        {agentInfo && (
          <p className="text-xs text-muted-foreground mt-0.5">{agentInfo}</p>
        )}
        {models.length > 1 && (
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            {models.map((model) => (
              <ModelItem key={model} model={model} agentEnabled={isEnabled} />
            ))}
          </div>
        )}
      </div>
      <Switch
        checked={isEnabled}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
    </div>
  );
}

function ModelItem({
  model,
  agentEnabled,
}: {
  model: AIModel;
  agentEnabled: boolean;
}) {
  const displayName = getModelDisplayName(model);
  const modelInfo = getModelInfo(model);
  const { modelPreferences, updateModelPreference } =
    useAgentAndModelsEnabledSection();
  const isEnabled =
    modelPreferences[model] ??
    isModelEnabledByDefault({ model, agentVersion: "latest" });
  return (
    <>
      <Checkbox
        id={`model-${model}`}
        checked={isEnabled}
        onCheckedChange={(checked) => updateModelPreference(model, !!checked)}
        disabled={!agentEnabled}
        className={cn("mt-0.5", {
          "opacity-75": !agentEnabled || !isEnabled,
        })}
      />
      <label
        htmlFor={`model-${model}`}
        className={cn(
          "cursor-pointer text-sm peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          {
            "opacity-75": !agentEnabled || !isEnabled,
          },
        )}
      >
        <span className="font-medium">{displayName.fullName}</span>
        {modelInfo && (
          <p className="text-xs text-muted-foreground mt-0.5">{modelInfo}</p>
        )}
      </label>
    </>
  );
}
