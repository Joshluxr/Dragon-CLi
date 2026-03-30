"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import {
  useExchangeClaudeAuthorizationCodeMutation,
  useSaveCodexAuthJsonMutation,
  useSaveApiKeyMutation,
  useSaveApiOverrideMutation,
  useSaveKimiConfigTomlMutation,
  useSaveMinimaxClaudeCredentialMutation,
} from "@/queries/credentials-queries";
import type { ClaudeApiOverrideProvider } from "@dragon/shared/db/types";
import type { AuthType } from "@/lib/claude-oauth";
import { Textarea } from "@/components/ui/textarea";
import { AIAgent } from "@dragon/agent/types";

type ApiKeyConfig = {
  agent: AIAgent;
  agentName: string;
  placeholder: string;
  validatePrefix: string;
  helpText: React.ReactNode;
};

const API_KEY_CONFIGS = {
  amp: {
    agent: "amp" as const,
    agentName: "Amp",
    placeholder: "sgamp_user...",
    validatePrefix: "sgamp_user",
    helpText: (
      <>
        Enter your Amp API key to use the Amp model. Get one from your{" "}
        <a
          href="https://ampcode.com/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Amp Code Settings Page
        </a>
      </>
    ),
  },
  gemini: {
    agent: "gemini" as const,
    agentName: "Gemini",
    placeholder: "AIza...",
    validatePrefix: "AIza",
    helpText: (
      <>
        Enter your Gemini API key to use the Gemini model. Get one at{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Google AI Studio
        </a>
      </>
    ),
  },
} as const satisfies Record<string, ApiKeyConfig>;

// Generic API key dialog for providers that only support API keys
function AddApiKeyDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ApiKeyConfig;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const saveApiKeyMutation = useSaveApiKeyMutation();

  const resetForm = () => {
    setApiKey("");
    setShowApiKey(false);
  };

  const validateApiKey = (key: string) => {
    return key.startsWith(config.validatePrefix);
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error(`Please enter a ${config.agentName} API key`);
      return;
    }
    if (!validateApiKey(apiKey)) {
      toast.error(
        `Invalid API key format. Please check your ${config.agentName} API key.`,
      );
      return;
    }
    await saveApiKeyMutation.mutateAsync({ agent: config.agent, apiKey });
    onOpenChange(false);
    resetForm();
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.agentName}</DialogTitle>
          <DialogDescription>
            Add your {config.agentName} API key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{config.helpText}</p>
          <div className="relative">
            <Input
              id="apiKey"
              type={showApiKey ? "text" : "password"}
              placeholder={config.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              className="pr-10"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-0 top-0 h-full px-3"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!apiKey || saveApiKeyMutation.isPending}
          >
            {saveApiKeyMutation.isPending ? "Adding..." : "Add Credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Specific dialog exports using the generic component
export function AddAmpCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AddApiKeyDialog
      open={open}
      onOpenChange={onOpenChange}
      config={API_KEY_CONFIGS.amp}
    />
  );
}

export function AddGeminiCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AddApiKeyDialog
      open={open}
      onOpenChange={onOpenChange}
      config={API_KEY_CONFIGS.gemini}
    />
  );
}

// Claude dialog with subscription OAuth or API key
export function AddClaudeCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<
    "api-key" | "subscription" | "minimax" | null
  >(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [minimaxBaseUrl, setMinimaxBaseUrl] = useState(
    "https://api.minimax.io/anthropic",
  );
  const [minimaxModel, setMinimaxModel] = useState("MiniMax-M2.7");
  const [loading, setLoading] = useState(false);
  const [authType, setAuthType] = useState<AuthType | null>(null);
  const [codeVerifier, setCodeVerifier] = useState("");
  const [authCode, setAuthCode] = useState("");

  const saveApiKeyMutation = useSaveApiKeyMutation();
  const exchangeCodeMutation = useExchangeClaudeAuthorizationCodeMutation();
  const saveMinimaxMutation = useSaveMinimaxClaudeCredentialMutation();

  const resetForm = () => {
    setMode(null);
    setApiKey("");
    setShowApiKey(false);
    setMinimaxBaseUrl("https://api.minimax.io/anthropic");
    setMinimaxModel("MiniMax-M2.7");
    setCodeVerifier("");
    setAuthCode("");
    setAuthType(null);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "claude-oauth-started") {
        setCodeVerifier(event.data.codeVerifier);
        setLoading(false);
        toast.info(
          "Complete authentication in the popup window, then paste the code below",
        );
      } else if (event.data.type === "claude-oauth-error") {
        setLoading(false);
        toast.error(
          event.data.error || "Authentication failed. Please try again.",
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open]);

  const handleStartClaudeAuth = async (type: AuthType) => {
    setLoading(true);
    setAuthType(type);

    const width = 900;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/auth/claude-redirect?type=${type}`,
      "claude-oauth",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      window.location.href = `/auth/claude-redirect?type=${type}`;
    }
  };

  const handleExchangeCode = async () => {
    if (!authCode || !codeVerifier || !authType) {
      toast.error("Please complete the authentication flow first");
      return;
    }
    const [actualCode, state] = authCode.split("#");
    if (!state || !actualCode) {
      toast.error(
        "Invalid code format. Please paste the complete URL from the authentication window.",
      );
      return;
    }
    await exchangeCodeMutation.mutateAsync({
      code: actualCode,
      codeVerifier,
      state,
      authType,
    });
    onOpenChange(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error("Please enter a Claude API key");
      return;
    }
    if (!apiKey.startsWith("sk-ant-")) {
      toast.error("Invalid API key format. Please check your Claude API key.");
      return;
    }
    await saveApiKeyMutation.mutateAsync({ agent: "claudeCode", apiKey });
    onOpenChange(false);
    resetForm();
  };

  const handleSubmitMinimax = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter your MiniMax API key");
      return;
    }
    await saveMinimaxMutation.mutateAsync({
      apiKey: apiKey.trim(),
      baseUrl: minimaxBaseUrl.trim(),
      modelName: minimaxModel.trim() || "MiniMax-M2.7",
    });
    onOpenChange(false);
    resetForm();
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claude</DialogTitle>
          <DialogDescription>
            {mode === null
              ? "Choose how you'd like to add credentials for Claude."
              : mode === "api-key"
                ? "Add a new API key for Claude."
                : mode === "minimax"
                  ? "Use MiniMax M2.7 through the Claude-compatible API (see MiniMax docs)."
                  : "Connect your Claude subscription."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {mode === null ? (
            <div className="space-y-3">
              <Button
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setMode("subscription");
                  handleStartClaudeAuth("subscription");
                }}
                disabled={loading}
              >
                {loading && authType === "subscription"
                  ? "Opening..."
                  : "Connect Claude subscription"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMode("api-key")}
              >
                Add API Key
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMode("minimax")}
              >
                MiniMax M2.7 (Claude Code API)
              </Button>
            </div>
          ) : mode === "api-key" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter your Anthropic API key. Create one at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  console.anthropic.com
                </a>
              </p>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-ant-api03-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.trim())}
                  className="pr-10"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : mode === "minimax" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Get an API key from the{" "}
                <a
                  href="https://platform.minimax.io/user-center/basic-information/interface-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  MiniMax Developer Platform
                </a>
                . International base URL is pre-filled; use{" "}
                <span className="font-mono text-xs">
                  https://api.minimaxi.com/anthropic
                </span>{" "}
                in China. See{" "}
                <a
                  href="https://platform.minimax.io/docs/coding-plan/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Claude Code setup
                </a>
                .
              </p>
              <div className="space-y-1">
                <label
                  htmlFor="minimaxBaseUrl"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Anthropic-compatible API base URL
                </label>
                <Input
                  id="minimaxBaseUrl"
                  type="url"
                  placeholder="https://api.minimax.io/anthropic"
                  value={minimaxBaseUrl}
                  onChange={(e) => setMinimaxBaseUrl(e.target.value.trim())}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="minimaxModel"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Model name (optional)
                </label>
                <Input
                  id="minimaxModel"
                  placeholder="MiniMax-M2.7"
                  value={minimaxModel}
                  onChange={(e) => setMinimaxModel(e.target.value.trim())}
                />
              </div>
              <div className="relative">
                <Input
                  id="minimaxApiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="MiniMax API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.trim())}
                  className="pr-10"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!codeVerifier ? (
                <p className="text-sm text-muted-foreground">
                  Complete the authentication in the popup window, then paste
                  the code below.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Authorize Claude in the new window, then paste code below:
                  </p>
                  <input
                    type="text"
                    placeholder="Paste authentication code"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value.trim())}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {mode === "api-key" && (
            <Button
              onClick={handleSubmit}
              disabled={!apiKey || saveApiKeyMutation.isPending}
            >
              {saveApiKeyMutation.isPending ? "Adding..." : "Add Credential"}
            </Button>
          )}
          {mode === "minimax" && (
            <Button
              onClick={handleSubmitMinimax}
              disabled={!apiKey.trim() || saveMinimaxMutation.isPending}
            >
              {saveMinimaxMutation.isPending ? "Adding..." : "Add Credential"}
            </Button>
          )}
          {mode === "subscription" && codeVerifier && (
            <Button
              onClick={handleExchangeCode}
              disabled={!authCode || exchangeCodeMutation.isPending}
            >
              {exchangeCodeMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// API Override config for Kimi and GLM
type ApiOverrideConfig = {
  provider: ClaudeApiOverrideProvider;
  providerName: string;
  placeholder: string;
  baseUrl: string;
  helpText: React.ReactNode;
};

const API_OVERRIDE_CONFIGS: Record<
  ClaudeApiOverrideProvider,
  ApiOverrideConfig
> = {
  kimi: {
    provider: "kimi",
    providerName: "Kimi (Moonshot)",
    placeholder: "sk-...",
    baseUrl: "https://api.moonshot.cn/v1",
    helpText: (
      <>
        Enter your Kimi API key. Get one from{" "}
        <a
          href="https://platform.moonshot.cn/console/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Moonshot Platform
        </a>
      </>
    ),
  },
  glm: {
    provider: "glm",
    providerName: "GLM (Zhipu AI)",
    placeholder: "...",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    helpText: (
      <>
        Enter your GLM API key. Get one from{" "}
        <a
          href="https://open.bigmodel.cn/usercenter/apikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Zhipu AI Platform
        </a>
      </>
    ),
  },
};

// Generic API Override dialog for providers like Kimi and GLM
function AddApiOverrideDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ApiOverrideConfig;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const saveApiOverrideMutation = useSaveApiOverrideMutation();

  const resetForm = () => {
    setApiKey("");
    setShowApiKey(false);
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error(`Please enter a ${config.providerName} API key`);
      return;
    }
    await saveApiOverrideMutation.mutateAsync({
      provider: config.provider,
      apiKey,
      baseUrl: config.baseUrl,
    });
    onOpenChange(false);
    resetForm();
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.providerName}</DialogTitle>
          <DialogDescription>
            Add your {config.providerName} API key to use {config.providerName}{" "}
            models.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{config.helpText}</p>
          <div className="relative">
            <Input
              id="apiKey"
              type={showApiKey ? "text" : "password"}
              placeholder={config.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              className="pr-10"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-0 top-0 h-full px-3"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!apiKey || saveApiOverrideMutation.isPending}
          >
            {saveApiOverrideMutation.isPending ? "Adding..." : "Add Credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Kimi dialog with subscription (config.toml) or API key
export function AddKimiCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"api-key" | "subscription" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [configToml, setConfigToml] = useState("");
  const [showKimiHelp, setShowKimiHelp] = useState(false);

  const saveApiOverrideMutation = useSaveApiOverrideMutation();
  const saveKimiConfigMutation = useSaveKimiConfigTomlMutation();

  const resetForm = () => {
    setMode(null);
    setApiKey("");
    setShowApiKey(false);
    setConfigToml("");
  };

  const handleSaveKimiConfig = async () => {
    if (!configToml.trim()) {
      toast.error("Please paste your config.toml content");
      return;
    }
    await saveKimiConfigMutation.mutateAsync({
      configToml,
    });
    onOpenChange(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error("Please enter a Kimi API key");
      return;
    }
    await saveApiOverrideMutation.mutateAsync({
      provider: "kimi",
      apiKey,
      baseUrl: API_OVERRIDE_CONFIGS.kimi.baseUrl,
    });
    onOpenChange(false);
    resetForm();
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kimi (Moonshot)</DialogTitle>
          <DialogDescription>
            {mode === null
              ? "Choose how you'd like to add credentials for Kimi."
              : mode === "api-key"
                ? "Add a new API key for Kimi."
                : "Connect your Kimi subscription."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {mode === null ? (
            <div className="space-y-3">
              <Button
                size="sm"
                className="w-full justify-start"
                onClick={() => setMode("subscription")}
              >
                Connect Kimi subscription
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMode("api-key")}
              >
                Add API Key
              </Button>
            </div>
          ) : mode === "api-key" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter your Kimi API key. Get one from{" "}
                <a
                  href="https://platform.moonshot.cn/console/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Moonshot Platform
                </a>
              </p>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.trim())}
                  className="pr-10"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Log in to Kimi CLI, then paste your{" "}
                <code className="font-mono rounded bg-muted px-1">
                  ~/.kimi/config.toml
                </code>{" "}
                below:
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-0 text-xs text-muted-foreground justify-start"
                onClick={() => setShowKimiHelp((v) => !v)}
              >
                {showKimiHelp ? (
                  <ChevronDown className="mr-1 h-3 w-3" />
                ) : (
                  <ChevronRight className="mr-1 h-3 w-3" />
                )}
                {showKimiHelp
                  ? "Hide setup instructions"
                  : "How to get config.toml"}
              </Button>
              {showKimiHelp && (
                <div className="mt-2 space-y-2 text-sm">
                  <pre className="rounded-md bg-muted p-2 overflow-x-auto">
                    <code>{`# Install Kimi CLI
uv tool install --python 3.13 kimi-cli

# Run Kimi CLI and login
kimi
/login

# Copy config.toml (macOS/Linux)
cat ~/.kimi/config.toml | pbcopy`}</code>
                  </pre>
                  <p className="text-muted-foreground">Then paste it below.</p>
                </div>
              )}
              <Textarea
                placeholder={`[providers.kimi-for-coding]\ntype = "kimi"\nbase_url = "https://api.kimi.com/coding/v1"\napi_key = "sk-xxx"`}
                value={configToml}
                onChange={(e) => setConfigToml(e.target.value)}
                className="min-h-24 max-h-48 overflow-x-auto font-mono break-all"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {mode === "api-key" && (
            <Button
              onClick={handleSubmit}
              disabled={!apiKey || saveApiOverrideMutation.isPending}
            >
              {saveApiOverrideMutation.isPending
                ? "Adding..."
                : "Add Credential"}
            </Button>
          )}
          {mode === "subscription" && (
            <Button
              onClick={handleSaveKimiConfig}
              disabled={saveKimiConfigMutation.isPending}
            >
              {saveKimiConfigMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// GLM API credential dialog
export function AddGlmCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AddApiOverrideDialog
      open={open}
      onOpenChange={onOpenChange}
      config={API_OVERRIDE_CONFIGS.glm}
    />
  );
}

// Codex dialog with ChatGPT subscription (auth.json) or API key
export function AddCodexCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"api-key" | "subscription" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [authJson, setAuthJson] = useState("");
  const [showCodexHelp, setShowCodexHelp] = useState(false);

  const saveApiKeyMutation = useSaveApiKeyMutation();
  const saveCodexMutation = useSaveCodexAuthJsonMutation();

  const resetForm = () => {
    setMode(null);
    setApiKey("");
    setShowApiKey(false);
    setAuthJson("");
  };

  const handleSaveCodexAuth = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(authJson);
    } catch (e) {
      toast.error(
        "Invalid JSON format. Please check your auth.json and try again.",
      );
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      toast.error("Invalid auth.json. Make sure it contains valid token data.");
      return;
    }
    await saveCodexMutation.mutateAsync({
      authJson: JSON.stringify(parsed),
    });
    onOpenChange(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error("Please enter an OpenAI API key");
      return;
    }
    if (!apiKey.startsWith("sk-")) {
      toast.error("Invalid API key format. Please check your OpenAI API key.");
      return;
    }
    await saveApiKeyMutation.mutateAsync({ agent: "codex", apiKey });
    onOpenChange(false);
    resetForm();
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Codex</DialogTitle>
          <DialogDescription>
            {mode === null
              ? "Choose how you'd like to add credentials for Codex."
              : mode === "api-key"
                ? "Add a new API key for Codex."
                : "Connect your ChatGPT subscription."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {mode === null ? (
            <div className="space-y-3">
              <Button
                size="sm"
                className="w-full justify-start"
                onClick={() => setMode("subscription")}
              >
                Connect ChatGPT subscription
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMode("api-key")}
              >
                Add API Key
              </Button>
            </div>
          ) : mode === "api-key" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter your OpenAI API key. Get one from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  platform.openai.com/api-keys
                </a>
              </p>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.trim())}
                  className="pr-10"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Log in to ChatGPT in a terminal, then paste your{" "}
                <code className="font-mono rounded bg-muted px-1">
                  ~/.codex/auth.json
                </code>{" "}
                below:
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-0 text-xs text-muted-foreground justify-start"
                onClick={() => setShowCodexHelp((v) => !v)}
              >
                {showCodexHelp ? (
                  <ChevronDown className="mr-1 h-3 w-3" />
                ) : (
                  <ChevronRight className="mr-1 h-3 w-3" />
                )}
                {showCodexHelp
                  ? "Hide setup instructions"
                  : "How to get auth.json"}
              </Button>
              {showCodexHelp && (
                <div className="mt-2 space-y-2 text-sm">
                  <pre className="rounded-md bg-muted p-2 overflow-x-auto">
                    <code>{`# Install Codex
npm install -g @openai/codex

# Log in to ChatGPT
codex login

# Copy auth.json (macOS)
cat ~/.codex/auth.json | pbcopy`}</code>
                  </pre>
                  <p className="text-muted-foreground">Then paste it below.</p>
                </div>
              )}
              <Textarea
                placeholder={`{\n  "tokens": {\n    "access_token": "...",\n    "refresh_token": "...",\n    "id_token": "..."\n  }\n}`}
                value={authJson}
                onChange={(e) => setAuthJson(e.target.value)}
                className="min-h-24 max-h-48 overflow-x-auto font-mono break-all"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {mode === "api-key" && (
            <Button
              onClick={handleSubmit}
              disabled={!apiKey || saveApiKeyMutation.isPending}
            >
              {saveApiKeyMutation.isPending ? "Adding..." : "Add Credential"}
            </Button>
          )}
          {mode === "subscription" && (
            <Button
              onClick={handleSaveCodexAuth}
              disabled={saveCodexMutation.isPending}
            >
              {saveCodexMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
