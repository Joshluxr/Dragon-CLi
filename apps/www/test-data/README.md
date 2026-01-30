# Test Data

This directory contains test data files generated from Claude CLI for testing the UI components that render Claude's tool usage and responses.

These files were generated using the Claude CLI with the following command pattern:

```bash
echo "Can you run the [ToolName] tool for testing purposes? Run some commands that pass, some that fail etc" | claude -p --dangerously-skip-permissions --output-format stream-json --verbose
```

The output was then formatted as a JSON array for consumption by the test UI. You can view these by running `pnpm storybook` and navigating to the `Test Data` tab.

## Adding New Test Files

1. Generate the test data using Claude CLI:
   ```bash
   echo "Your test prompt here" | claude -p --dangerously-skip-permissions --output-format stream-json --verbose > raw-output.json
   ```
2. Format the output as a JSON array (Add a `[` and `]` around the array and `,` after each line.)
3. Save it with the naming pattern: `claude-json-[toolname]-test.json`
