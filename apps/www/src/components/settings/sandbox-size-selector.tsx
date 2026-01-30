import { useAtomValue } from "jotai";
import { userSettingsAtom, useUpdateUserSettingsMutation } from "@/atoms/user";
import type { SandboxSize } from "@terragon/types/sandbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useAccessInfo } from "@/queries/subscription";

export function SandboxSizeSelector() {
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  const largeSandboxSizeEnabled = useFeatureFlag("enableLargeSandboxSize");
  const { tier } = useAccessInfo();
  const isProUser = tier === "pro";
  const canSelectLarge = largeSandboxSizeEnabled && isProUser;
  return (
    <Select
      value={userSettings?.sandboxSize ?? "small"}
      onValueChange={async (value) => {
        await userSettingsMutation.mutateAsync({
          sandboxSize: value as SandboxSize,
        });
      }}
    >
      <SelectTrigger className="w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="small">Small</SelectItem>
        <SelectItem value="large" disabled={!canSelectLarge}>
          Large
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
