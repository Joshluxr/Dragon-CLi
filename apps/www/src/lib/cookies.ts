export const timeZoneKey = "timeZone";
export const threadListCollapsedSectionsKey = "thread-list-collapsed-sections";
export const disableGitCheckpointingKey = "disable-git-checkpointing";
export const skipSetupKey = "skip-setup";
export const createNewBranchKey = "create-new-branch";
export const threadListGroupByKey = "thread-list-group-by";
export const repositoryCollapsedSectionsKey = "repository-collapsed-sections";
export const threadListCollapsedKey = "thread-list-collapsed";
export const secondaryPaneClosedKey = "secondary-panel-closed";

export type ThreadListGroupBy = "lastUpdated" | "repository" | "createdAt";

export type CollapsedSections = {
  [key: string]: boolean;
};

export const defaultCollapsedSections: CollapsedSections = {};

export const defaultThreadListGroupBy: ThreadListGroupBy = "lastUpdated";

// Here we store cookies that are device specific that we don't want to be across devices.
export type UserCookies = {
  [timeZoneKey]?: string;
  [threadListGroupByKey]?: ThreadListGroupBy;
  [threadListCollapsedSectionsKey]?: CollapsedSections;
  [disableGitCheckpointingKey]?: boolean;
  [skipSetupKey]?: boolean;
  [createNewBranchKey]?: boolean;
  [threadListCollapsedKey]?: boolean;
  [secondaryPaneClosedKey]?: boolean;
};

export const defaultTimeZone = "UTC";

export const getDefaultUserCookies = (): UserCookies => {
  return {
    [timeZoneKey]: defaultTimeZone,
    [threadListCollapsedSectionsKey]: defaultCollapsedSections,
    [disableGitCheckpointingKey]: false,
    [skipSetupKey]: false,
    [createNewBranchKey]: true,
    [threadListGroupByKey]: defaultThreadListGroupBy,
    [threadListCollapsedKey]: false,
    [secondaryPaneClosedKey]: false,
  };
};

// Cookie expiration: 1 year in seconds
export const COOKIE_MAX_AGE_SECS = 60 * 60 * 24 * 365;
