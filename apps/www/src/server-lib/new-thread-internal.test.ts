import { describe, it, vi, beforeEach, expect } from "vitest";
import { newThreadInternal } from "./new-thread-internal";
import { db } from "@/lib/db";
import { createTestUser } from "@terragon/shared/model/test-helpers";
import { User, DBUserMessage } from "@terragon/shared";
import { mockWaitUntil, waitUntilResolved } from "@/test-helpers/mock-next";
import { getThread } from "@terragon/shared/model/threads";

const repoFullName = "terragon/test-repo";
const mockMessage: DBUserMessage = {
  type: "user",
  parts: [{ type: "text", text: "Internal task message" }],
  model: "sonnet",
};

describe("newThreadInternal", () => {
  let user: User;

  beforeEach(async () => {
    vi.clearAllMocks();
    const testUserResult = await createTestUser({ db });
    user = testUserResult.user;
  });

  describe("basic thread creation", () => {
    it("should create thread with baseBranchName", async () => {
      await mockWaitUntil();
      const { threadId } = await newThreadInternal({
        userId: user.id,
        message: mockMessage,
        githubRepoFullName: repoFullName,
        baseBranchName: "develop",
        headBranchName: null,
        sourceType: "www",
      });
      await waitUntilResolved();

      const thread = await getThread({ db, userId: user.id, threadId });
      expect(thread).toBeDefined();
      expect(thread!.repoBaseBranchName).toBe("develop");
      expect(thread!.branchName).toBeNull();
    });

    it("should create thread with headBranchName", async () => {
      await mockWaitUntil();
      const { threadId } = await newThreadInternal({
        userId: user.id,
        message: mockMessage,
        githubRepoFullName: repoFullName,
        baseBranchName: "main",
        headBranchName: "feature/webhook",
        sourceType: "www",
      });
      await waitUntilResolved();

      const thread = await getThread({ db, userId: user.id, threadId });
      expect(thread).toBeDefined();
      expect(thread!.repoBaseBranchName).toBe("main");
      expect(thread!.branchName).toBe("feature/webhook");
    });

    it("should use default branch when baseBranchName is undefined", async () => {
      await mockWaitUntil();
      const { threadId } = await newThreadInternal({
        userId: user.id,
        message: mockMessage,
        githubRepoFullName: repoFullName,
        sourceType: "www",
      });
      await waitUntilResolved();
      const thread = await getThread({ db, userId: user.id, threadId });
      expect(thread!.repoBaseBranchName).toBe("DEFAULT_BRANCH_NAME_FOR_TESTS");
    });
  });
});
