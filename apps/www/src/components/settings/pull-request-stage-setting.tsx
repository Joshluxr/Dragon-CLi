import { useAtomValue } from "jotai";
import { userSettingsAtom, useUpdateUserSettingsMutation } from "@/atoms/user";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PullRequestStageSetting() {
  const userSettings = useAtomValue(userSettingsAtom);
  const userSettingsMutation = useUpdateUserSettingsMutation();
  return (
    <Select
      value={userSettings?.prType}
      onValueChange={async (value) => {
        await userSettingsMutation.mutateAsync({
          prType: value as "draft" | "ready",
        });
      }}
    >
      <SelectTrigger className="w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="ready">Ready for review</SelectItem>
      </SelectContent>
    </Select>
  );
}
