/**
 * Database Handler Tests
 */

import { describe, it, expect } from "vitest";
import { handleDatabaseTool } from "./database.js";

describe("Database Handler", () => {
  describe("QueryDatabase", () => {
    it("should execute a valid SELECT query", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "SELECT * FROM user LIMIT 10",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.query).toBe("SELECT * FROM user LIMIT 10");
      expect(content.rows).toBeDefined();
      expect(Array.isArray(content.rows)).toBe(true);
    });

    it("should reject non-SELECT queries", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "DELETE FROM user WHERE id = 1",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Only SELECT queries are allowed");
    });

    it("should reject INSERT queries", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "INSERT INTO user (name) VALUES ('test')",
      });
      expect(result.isError).toBe(true);
    });

    it("should reject UPDATE queries", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "UPDATE user SET name = 'test'",
      });
      expect(result.isError).toBe(true);
    });

    it("should reject DROP queries", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "DROP TABLE user",
      });
      expect(result.isError).toBe(true);
    });

    it("should allow WITH (CTE) queries", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query:
          "WITH active_users AS (SELECT * FROM user) SELECT * FROM active_users",
      });
      expect(result.isError).toBeUndefined();
    });

    it("should enforce limit", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "SELECT * FROM user",
        limit: 50,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.limit).toBe(50);
    });

    it("should cap limit at 1000", async () => {
      const result = await handleDatabaseTool("QueryDatabase", {
        query: "SELECT * FROM user",
        limit: 5000,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.limit).toBe(1000);
    });
  });

  describe("ListTables", () => {
    it("should list tables in default schema", async () => {
      const result = await handleDatabaseTool("ListTables", {});
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.schema).toBe("public");
      expect(content.tables).toBeDefined();
      expect(Array.isArray(content.tables)).toBe(true);
      expect(content.tableCount).toBeGreaterThan(0);
    });

    it("should list tables with columns when requested", async () => {
      const result = await handleDatabaseTool("ListTables", {
        includeColumns: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      const firstTable = content.tables[0];
      expect(firstTable.columns).toBeDefined();
      expect(Array.isArray(firstTable.columns)).toBe(true);
    });

    it("should list tables without columns by default", async () => {
      const result = await handleDatabaseTool("ListTables", {});
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      const firstTable = content.tables[0];
      expect(firstTable.columns).toBeUndefined();
    });
  });

  describe("DescribeTable", () => {
    it("should describe a table", async () => {
      const result = await handleDatabaseTool("DescribeTable", {
        tableName: "user",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.name).toBe("user");
      expect(content.columns).toBeDefined();
      expect(Array.isArray(content.columns)).toBe(true);
    });

    it("should include indexes when requested", async () => {
      const result = await handleDatabaseTool("DescribeTable", {
        tableName: "user",
        includeIndexes: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.indexes).toBeDefined();
    });

    it("should include foreign keys when requested", async () => {
      const result = await handleDatabaseTool("DescribeTable", {
        tableName: "thread",
        includeForeignKeys: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.foreignKeys).toBeDefined();
    });

    it("should return error for non-existent table", async () => {
      const result = await handleDatabaseTool("DescribeTable", {
        tableName: "non_existent_table",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Table not found");
    });
  });

  describe("ExplainQuery", () => {
    it("should explain a query", async () => {
      const result = await handleDatabaseTool("ExplainQuery", {
        query: "SELECT * FROM user WHERE email = 'test@example.com'",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.plan).toBeDefined();
    });

    it("should return JSON format when requested", async () => {
      const result = await handleDatabaseTool("ExplainQuery", {
        query: "SELECT * FROM user",
        format: "json",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(typeof content.plan).toBe("object");
    });
  });

  describe("Unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleDatabaseTool("UnknownTool", {});
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Unknown database tool");
    });
  });
});
