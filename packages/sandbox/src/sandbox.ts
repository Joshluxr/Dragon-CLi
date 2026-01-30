import type { SandboxProvider } from "@terragon/types/sandbox";
import type { CreateSandboxOptions } from "./types";
import { getSandboxProvider } from "./provider";
import { setupSandboxEveryTime, setupSandboxOneTime } from "./setup";
import {
  executeWithCircuitBreaker,
  getBestAvailableProvider,
} from "./circuit-breakers";

export async function getOrCreateSandbox(
  sandboxId: string | null,
  options: CreateSandboxOptions,
) {
  // Check if preferred provider is available, get fallback if needed
  const effectiveProvider =
    getBestAvailableProvider(options.sandboxProvider) ??
    options.sandboxProvider;

  if (effectiveProvider !== options.sandboxProvider) {
    console.log(
      `[sandbox] Provider ${options.sandboxProvider} circuit is open, using fallback: ${effectiveProvider}`,
    );
  }

  const effectiveOptions = {
    ...options,
    sandboxProvider: effectiveProvider,
  };

  return getOrCreateSandboxInternal(sandboxId, effectiveOptions);
}

async function getOrCreateSandboxInternal(
  sandboxId: string | null,
  options: CreateSandboxOptions,
) {
  const provider = getSandboxProvider(options.sandboxProvider);
  const log = (msg: string) => {
    console.log(`[${options.sandboxProvider}] ${msg}`);
  };
  const startTime = Date.now();
  if (sandboxId) {
    log(`Resuming sandbox ${sandboxId}...`);
  } else {
    log(`Creating new sandbox for ${options.githubRepoFullName}...`);
    await options.onStatusUpdate({
      sandboxId: null,
      sandboxStatus: "provisioning",
      bootingStatus: "provisioning",
    });
  }

  // Use circuit breaker for the sandbox creation/resume operation
  const sandbox = await executeWithCircuitBreaker(
    options.sandboxProvider,
    () => provider.getOrCreateSandbox(sandboxId, options),
    { useFallback: false }, // We already selected the best provider above
  );

  if (!sandboxId) {
    await options.onStatusUpdate({
      sandboxId: sandbox.sandboxId,
      sandboxStatus: "booting",
      bootingStatus: "provisioning-done",
    });
  }
  log(`setupSandboxEveryTime ${sandbox.sandboxId}...`);
  await setupSandboxEveryTime({
    session: sandbox,
    options,
    isCreatingSandbox: !sandboxId,
  });
  if (!sandboxId) {
    log(`setupSandboxOneTime ${sandbox.sandboxId}...`);
    await setupSandboxOneTime(sandbox, options);
  }
  const duration = Date.now() - startTime;
  if (sandboxId) {
    log(`Resumed sandbox ${sandbox.sandboxId} in ${duration}ms`);
  } else {
    log(`Created sandbox ${sandbox.sandboxId} in ${duration}ms`);
  }
  await options.onStatusUpdate({
    sandboxId: sandbox.sandboxId,
    sandboxStatus: "running",
    bootingStatus: null,
  });
  return sandbox;
}

export async function hibernateSandbox({
  sandboxProvider,
  sandboxId,
}: {
  sandboxProvider: SandboxProvider;
  sandboxId: string;
}) {
  const provider = getSandboxProvider(sandboxProvider);
  await provider.hibernateById(sandboxId);
}

export async function extendSandboxLife({
  sandboxProvider,
  sandboxId,
}: {
  sandboxProvider: SandboxProvider;
  sandboxId: string;
}) {
  const provider = getSandboxProvider(sandboxProvider);
  await provider.extendLife(sandboxId);
}

export async function getSandboxOrNull({
  sandboxProvider,
  sandboxId,
}: {
  sandboxProvider: SandboxProvider;
  sandboxId: string;
}) {
  const provider = getSandboxProvider(sandboxProvider);
  return await provider.getSandboxOrNull(sandboxId);
}
