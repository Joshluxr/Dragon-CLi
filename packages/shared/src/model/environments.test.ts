import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type DB } from "../db";
import * as schema from "../db/schema";
import {
  getEnvironment,
  updateEnvironment,
  getOrCreateEnvironment,
} from "./environments";
import { createTestUser } from "./test-helpers";

describe("environments", () => {
  let db: DB;
  let userId: string;
  let environmentId: string;

  beforeEach(async () => {
    // Use the test database URL from environment (set by test setup)
    const testDbUrl = process.env.DATABASE_URL!;
    db = createDb(testDbUrl);

    // Create a test user
    const { user } = await createTestUser({ db });
    userId = user.id;

    // Create a test environment
    const [environment] = await db
      .insert(schema.environment)
      .values({
        userId,
        repoFullName: "test-org/test-repo",
      })
      .returning();
    environmentId = environment!.id;
  });

  describe("setup script functionality", () => {
    it("should save setup script to environment", async () => {
      const setupScript = `#!/bin/bash
echo "Running custom environment setup"
npm install
npm run build
echo "Setup complete!"`;

      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript,
        },
      });

      const updatedEnvironment = await getEnvironment({
        db,
        userId,
        environmentId,
      });

      expect(updatedEnvironment).toBeDefined();
      expect(updatedEnvironment?.setupScript).toBe(setupScript);
    });

    it("should allow null setup script to remove it", async () => {
      // First add a setup script
      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript: "echo 'test'",
        },
      });

      // Then remove it
      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript: null,
        },
      });

      const updatedEnvironment = await getEnvironment({
        db,
        userId,
        environmentId,
      });

      expect(updatedEnvironment?.setupScript).toBeNull();
    });

    it("should not affect other environment fields when updating setup script", async () => {
      // Add some environment variables first
      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          environmentVariables: [
            { key: "API_KEY", valueEncrypted: "encrypted_value" },
          ],
        },
      });

      // Update only the setup script
      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript: "echo 'new setup script'",
        },
      });

      const updatedEnvironment = await getEnvironment({
        db,
        userId,
        environmentId,
      });

      // Environment variables should remain unchanged
      expect(updatedEnvironment?.environmentVariables).toHaveLength(1);
      expect(updatedEnvironment?.environmentVariables?.[0]?.key).toBe(
        "API_KEY",
      );
      expect(updatedEnvironment?.setupScript).toBe("echo 'new setup script'");
    });

    it("should handle multi-line setup scripts with special characters", async () => {
      const complexScript = `#!/bin/bash
set -e

# Setup environment variables
export NODE_ENV="production"
export API_URL="https://api.example.com"

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Run database migrations
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running migrations..."
  npm run db:migrate
fi

# Build the application
npm run build

# Special characters test
echo 'Testing "quotes" and $variables'
echo "Path: \${PWD}"

# Exit successfully
exit 0`;

      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript: complexScript,
        },
      });

      const updatedEnvironment = await getEnvironment({
        db,
        userId,
        environmentId,
      });

      expect(updatedEnvironment?.setupScript).toBe(complexScript);
    });

    it("should only allow user to update their own environment", async () => {
      const otherUserId = "other-user-456";

      // Should return null when trying to get another user's environment
      const environment = await getEnvironment({
        db,
        userId: otherUserId,
        environmentId,
      });

      expect(environment).toBeUndefined();

      // Update should not affect the environment
      await updateEnvironment({
        db,
        userId: otherUserId,
        environmentId,
        updates: {
          setupScript: "malicious script",
        },
      });

      // Original user should still see unchanged environment
      const originalEnvironment = await getEnvironment({
        db,
        userId,
        environmentId,
      });

      expect(originalEnvironment?.setupScript).toBeNull();
    });
  });

  describe("getOrCreateEnvironment", () => {
    it("should create environment with null setup script by default", async () => {
      const newRepoFullName = "test-org/new-repo";

      const environment = await getOrCreateEnvironment({
        db,
        userId,
        repoFullName: newRepoFullName,
      });

      expect(environment).toBeDefined();
      expect(environment.userId).toBe(userId);
      expect(environment.repoFullName).toBe(newRepoFullName);
      expect(environment.setupScript).toBeNull();
    });

    it("should return existing environment with setup script", async () => {
      // Add setup script to existing environment
      await updateEnvironment({
        db,
        userId,
        environmentId,
        updates: {
          setupScript: "echo 'existing script'",
        },
      });

      // Get or create should return the existing one
      const environment = await getOrCreateEnvironment({
        db,
        userId,
        repoFullName: "test-org/test-repo",
      });

      expect(environment.id).toBe(environmentId);
      expect(environment.setupScript).toBe("echo 'existing script'");
    });
  });
});
