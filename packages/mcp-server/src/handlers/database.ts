/**
 * Database Handler
 *
 * Handles database-related MCP tool calls.
 * In production, connects to PostgreSQL via the shared db package.
 * For standalone mode, provides simulated responses.
 */

import type {
  ToolResult,
  QueryDatabaseArgs,
  ListTablesArgs,
  DescribeTableArgs,
} from "../types/index.js";

/**
 * Validate SQL query is read-only
 */
function isReadOnlyQuery(query: string): boolean {
  const normalized = query.trim().toUpperCase();

  // Check for SELECT at start (allowing WITH for CTEs)
  const startsWithSelect =
    normalized.startsWith("SELECT") ||
    normalized.startsWith("WITH") ||
    normalized.startsWith("EXPLAIN");

  // Check for dangerous keywords
  const dangerousKeywords = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "CREATE",
    "ALTER",
    "TRUNCATE",
    "GRANT",
    "REVOKE",
    "COPY",
    "EXECUTE",
  ];

  const hasDangerousKeyword = dangerousKeywords.some((keyword) => {
    // Check if keyword appears as a statement (not inside quotes or as part of identifier)
    const regex = new RegExp(`\\b${keyword}\\b(?![^']*'[^']*$)`, "i");
    return regex.test(normalized);
  });

  return startsWithSelect && !hasDangerousKeyword;
}

/**
 * Query the database
 */
export async function handleQueryDatabase(
  args: QueryDatabaseArgs,
): Promise<ToolResult> {
  const { query, params = [], limit = 100 } = args;

  // Validate query is read-only
  if (!isReadOnlyQuery(query)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Only SELECT queries are allowed for safety.",
            suggestion:
              "Use dedicated tools for INSERT, UPDATE, DELETE operations.",
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate limit
  const safeLimit = Math.min(Math.max(1, limit), 1000);

  // In production:
  // const db = await getDbConnection();
  // const result = await db.execute(sql`${query}`, params);

  // Simulated response for standalone mode
  const simulatedResult = getSimulatedQueryResult(query);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          query,
          params,
          limit: safeLimit,
          rowCount: simulatedResult.rows.length,
          rows: simulatedResult.rows,
          columns: simulatedResult.columns,
          duration: `${Math.floor(Math.random() * 50 + 5)}ms`,
        }),
      },
    ],
  };
}

/**
 * List database tables
 */
export async function handleListTables(
  args: ListTablesArgs,
): Promise<ToolResult> {
  const { schema = "public", includeColumns = false } = args;

  // In production:
  // const tables = await db.query(sql`
  //   SELECT table_name, ...
  //   FROM information_schema.tables
  //   WHERE table_schema = ${schema}
  // `);

  // Simulated response
  const tables = [
    {
      name: "user",
      schema: "public",
      rowCountEstimate: 1500,
      columns: includeColumns
        ? [
            { name: "id", type: "text", nullable: false },
            { name: "name", type: "text", nullable: false },
            { name: "email", type: "text", nullable: false },
            { name: "created_at", type: "timestamp", nullable: false },
          ]
        : undefined,
    },
    {
      name: "session",
      schema: "public",
      rowCountEstimate: 5000,
      columns: includeColumns
        ? [
            { name: "id", type: "text", nullable: false },
            { name: "user_id", type: "text", nullable: false },
            { name: "expires_at", type: "timestamp", nullable: false },
          ]
        : undefined,
    },
    {
      name: "thread",
      schema: "public",
      rowCountEstimate: 12000,
      columns: includeColumns
        ? [
            { name: "id", type: "text", nullable: false },
            { name: "user_id", type: "text", nullable: false },
            { name: "title", type: "text", nullable: true },
            { name: "status", type: "text", nullable: false },
            { name: "created_at", type: "timestamp", nullable: false },
          ]
        : undefined,
    },
    {
      name: "sandbox",
      schema: "public",
      rowCountEstimate: 800,
      columns: includeColumns
        ? [
            { name: "id", type: "text", nullable: false },
            { name: "thread_id", type: "text", nullable: false },
            { name: "provider", type: "text", nullable: false },
            { name: "status", type: "text", nullable: false },
          ]
        : undefined,
    },
  ];

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          schema,
          tableCount: tables.length,
          tables,
        }),
      },
    ],
  };
}

/**
 * Describe a table
 */
export async function handleDescribeTable(
  args: DescribeTableArgs,
): Promise<ToolResult> {
  const {
    tableName,
    includeIndexes = true,
    includeForeignKeys = true,
    includeSampleData = false,
  } = args as unknown as DescribeTableArgs & { includeSampleData?: boolean };

  // In production, query information_schema

  // Simulated response based on common tables
  const tableDescriptions: Record<string, unknown> = {
    user: {
      name: "user",
      schema: "public",
      rowCount: 1500,
      columns: [
        {
          name: "id",
          type: "text",
          nullable: false,
          primaryKey: true,
          description: "User ID (UUID)",
        },
        {
          name: "name",
          type: "text",
          nullable: false,
          description: "Display name",
        },
        {
          name: "email",
          type: "text",
          nullable: false,
          unique: true,
          description: "Email address",
        },
        {
          name: "email_verified",
          type: "boolean",
          nullable: false,
          default: "false",
        },
        {
          name: "image",
          type: "text",
          nullable: true,
          description: "Avatar URL",
        },
        {
          name: "created_at",
          type: "timestamp",
          nullable: false,
          default: "now()",
        },
        { name: "updated_at", type: "timestamp", nullable: false },
        {
          name: "stripe_customer_id",
          type: "text",
          nullable: true,
          description: "Stripe customer ID",
        },
      ],
      indexes: includeIndexes
        ? [
            { name: "user_pkey", columns: ["id"], unique: true },
            { name: "user_email_key", columns: ["email"], unique: true },
          ]
        : undefined,
      foreignKeys: includeForeignKeys ? [] : undefined,
      sampleData: includeSampleData
        ? [
            {
              id: "usr_abc123",
              name: "John Doe",
              email: "john@example.com",
              created_at: "2024-01-15T10:30:00Z",
            },
          ]
        : undefined,
    },
    thread: {
      name: "thread",
      schema: "public",
      rowCount: 12000,
      columns: [
        { name: "id", type: "text", nullable: false, primaryKey: true },
        { name: "user_id", type: "text", nullable: false },
        { name: "title", type: "text", nullable: true },
        { name: "status", type: "text", nullable: false },
        { name: "created_at", type: "timestamp", nullable: false },
        { name: "updated_at", type: "timestamp", nullable: false },
      ],
      indexes: includeIndexes
        ? [
            { name: "thread_pkey", columns: ["id"], unique: true },
            { name: "thread_user_id_idx", columns: ["user_id"], unique: false },
          ]
        : undefined,
      foreignKeys: includeForeignKeys
        ? [
            {
              name: "thread_user_id_fkey",
              columns: ["user_id"],
              references: { table: "user", columns: ["id"] },
              onDelete: "CASCADE",
            },
          ]
        : undefined,
    },
  };

  const description = tableDescriptions[tableName];
  if (!description) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Table not found: ${tableName}`,
            suggestion: "Use ListTables to see available tables.",
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(description),
      },
    ],
  };
}

/**
 * Explain query plan
 */
export async function handleExplainQuery(args: {
  query: string;
  analyze?: boolean;
  format?: string;
}): Promise<ToolResult> {
  const { query, analyze = false, format = "text" } = args;

  // Simulated explain output
  const explainOutput = `
Seq Scan on users  (cost=0.00..35.50 rows=1500 width=100)
  Filter: (email = 'test@example.com'::text)
  Rows Removed by Filter: 0
Planning Time: 0.085 ms
${analyze ? "Execution Time: 0.125 ms" : ""}
`.trim();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          query,
          analyze,
          format,
          plan:
            format === "json"
              ? { type: "Seq Scan", cost: "0.00..35.50" }
              : explainOutput,
        }),
      },
    ],
  };
}

/**
 * Route database tool calls
 */
export async function handleDatabaseTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "QueryDatabase":
      return handleQueryDatabase(args as unknown as QueryDatabaseArgs);
    case "ListTables":
      return handleListTables(args as unknown as ListTablesArgs);
    case "DescribeTable":
      return handleDescribeTable(args as unknown as DescribeTableArgs);
    case "ExplainQuery":
      return handleExplainQuery(
        args as { query: string; analyze?: boolean; format?: string },
      );
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown database tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}

/**
 * Get simulated query results for standalone mode
 */
function getSimulatedQueryResult(query: string): {
  rows: Record<string, unknown>[];
  columns: string[];
} {
  const normalizedQuery = query.toLowerCase();

  // Detect table from query
  if (
    normalizedQuery.includes("from user") ||
    normalizedQuery.includes('from "user"')
  ) {
    return {
      columns: ["id", "name", "email", "created_at"],
      rows: [
        {
          id: "usr_abc123",
          name: "John Doe",
          email: "john@example.com",
          created_at: "2024-01-15T10:30:00Z",
        },
        {
          id: "usr_def456",
          name: "Jane Smith",
          email: "jane@example.com",
          created_at: "2024-01-16T14:20:00Z",
        },
      ],
    };
  }

  if (normalizedQuery.includes("from thread")) {
    return {
      columns: ["id", "user_id", "title", "status", "created_at"],
      rows: [
        {
          id: "thr_123",
          user_id: "usr_abc123",
          title: "Feature request",
          status: "active",
          created_at: "2024-01-20T09:00:00Z",
        },
      ],
    };
  }

  // Count queries
  if (normalizedQuery.includes("count(")) {
    return {
      columns: ["count"],
      rows: [{ count: 1500 }],
    };
  }

  // Default response
  return {
    columns: ["result"],
    rows: [{ result: "Query executed successfully" }],
  };
}
