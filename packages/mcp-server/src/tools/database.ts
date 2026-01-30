/**
 * Database Tools
 *
 * These tools allow AI agents to interact with the PostgreSQL database
 * for querying data, inspecting schemas, and managing tables.
 */

import type { ToolDefinition } from "../types/index.js";

export const databaseTools: ToolDefinition[] = [
  {
    name: "QueryDatabase",
    description: `Execute a read-only SQL query against the database.

Use this when:
- Fetching data for analysis
- Checking existing records
- Generating reports
- Verifying data integrity

IMPORTANT:
- Only SELECT queries are allowed for safety
- Use parameterized queries to prevent SQL injection
- Results are limited to prevent memory issues

Returns: rows, rowCount, and column metadata`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "SQL SELECT query to execute. Must be a SELECT statement.",
        },
        params: {
          type: "array",
          items: { type: "string" },
          description:
            "Query parameters for prepared statements. Use $1, $2, etc. in query.",
        },
        limit: {
          type: "number",
          description:
            "Maximum rows to return. Default: 100, Max: 1000. Added as LIMIT if not present in query.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "ListTables",
    description: `List all tables in the database with their schemas.

Use this when:
- Exploring database structure
- Finding relevant tables for a task
- Understanding data relationships

Returns: array of tables with name, schema, rowCount estimate, and optionally columns`,
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description:
            "Database schema to list. Default: 'public'. Use 'all' for all schemas.",
        },
        includeColumns: {
          type: "boolean",
          description: "Include column details for each table. Default: false",
        },
      },
    },
  },
  {
    name: "DescribeTable",
    description: `Get detailed information about a specific table.

Use this when:
- Understanding table structure before querying
- Checking column types and constraints
- Finding relationships to other tables

Returns: columns, indexes, foreign keys, constraints, and row count`,
    inputSchema: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "Name of the table to describe",
        },
        schema: {
          type: "string",
          description: "Schema containing the table. Default: 'public'",
        },
        includeIndexes: {
          type: "boolean",
          description: "Include index information. Default: true",
        },
        includeForeignKeys: {
          type: "boolean",
          description: "Include foreign key relationships. Default: true",
        },
        includeSampleData: {
          type: "boolean",
          description: "Include 5 sample rows. Default: false",
        },
      },
      required: ["tableName"],
    },
  },
  {
    name: "ExplainQuery",
    description: `Get the execution plan for a SQL query.

Use this when:
- Optimizing slow queries
- Understanding query performance
- Debugging complex queries

Returns: query plan with cost estimates and execution details`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to explain",
        },
        analyze: {
          type: "boolean",
          description:
            "Run EXPLAIN ANALYZE (actually executes query). Default: false",
        },
        format: {
          type: "string",
          enum: ["text", "json"],
          description: "Output format. Default: 'text'",
        },
      },
      required: ["query"],
    },
  },
];

export const databaseToolNames = databaseTools.map((t) => t.name);
