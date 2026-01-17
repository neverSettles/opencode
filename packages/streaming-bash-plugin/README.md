# @neversettles/opencode-streaming-bash

OpenCode plugin that provides real-time streaming bash output.

## Installation

Add the plugin to your `opencode.jsonc` config:

```jsonc
{
  "plugin": ["@neversettles/opencode-streaming-bash"]
}
```

Or install from a local file:

```jsonc
{
  "plugin": ["file:///path/to/streaming-bash-plugin/dist/index.js"]
}
```

## Usage

Once installed, you have access to the `streaming_bash` tool:

```
Use streaming_bash to run: npm install
```

The key difference from the built-in `bash` tool is that output streams to the UI in real-time as it's generated, rather than waiting for the command to complete.

## How It Works

The plugin uses OpenCode's `ctx.metadata()` API to stream output chunks to the UI as they arrive from stdout/stderr. The OpenCode UI reactively consumes these metadata updates and refreshes the display.

This is particularly useful for:
- Long-running build commands
- Watching file changes
- Monitoring logs
- Any command where you want to see progress in real-time

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string | The bash command to execute |
| `description` | string | Brief description of what this command does |
| `timeout` | number (optional) | Timeout in milliseconds (default: 120000) |
| `workdir` | string (optional) | Working directory for the command |

## Metadata Output

The tool streams the following metadata to the UI:

- `output` - The accumulated command output (truncated at 30KB)
- `description` - The command description
- `streaming` - Whether output is still being streamed
- `bytesReceived` - Total bytes received so far
- `exitCode` - Exit code when complete
- `timedOut` - Whether the command timed out
- `aborted` - Whether the command was aborted

## License

MIT
