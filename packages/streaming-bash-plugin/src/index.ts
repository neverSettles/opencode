import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"
import { spawn } from "child_process"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = 2 * 60 * 1000 // 2 minutes

/**
 * StreamingBashPlugin - Provides real-time streaming bash output in OpenCode
 *
 * This plugin registers a "streaming_bash" tool that streams command output
 * to the UI as it's generated, rather than waiting for the command to complete.
 *
 * The output is streamed via ctx.metadata() which the OpenCode UI consumes
 * reactively, updating the display in real-time.
 */
export const StreamingBashPlugin: Plugin = async (ctx) => {
  const shell = Bun.env.SHELL || "/bin/bash"

  return {
    tool: {
      streaming_bash: tool({
        description: `Execute a bash command with real-time streaming output.

This tool is similar to the built-in bash tool but emphasizes streaming - you'll see
output as it's generated rather than waiting for the command to complete.

Use this for long-running commands where you want to monitor progress in real-time.

Working directory: ${ctx.directory}`,
        args: {
          command: tool.schema.string().describe("The bash command to execute"),
          timeout: tool.schema.number().optional().describe("Timeout in milliseconds (default: 120000)"),
          workdir: tool.schema.string().optional().describe("Working directory for the command"),
          description: tool.schema.string().describe("Brief description of what this command does"),
        },
        async execute(args, context) {
          const cwd = args.workdir || ctx.directory
          const timeout = args.timeout ?? DEFAULT_TIMEOUT

          // Initialize metadata with empty output
          context.metadata({
            title: args.description,
            metadata: {
              output: "",
              description: args.description,
              streaming: true,
            },
          })

          return new Promise<string>((resolve, reject) => {
            const proc = spawn(args.command, {
              shell,
              cwd,
              env: { ...Bun.env },
              stdio: ["ignore", "pipe", "pipe"],
            })

            let output = ""
            let timedOut = false
            let aborted = false

            // Stream output chunks as they arrive
            const append = (chunk: Buffer) => {
              output += chunk.toString()

              // Update metadata with current output (truncated if too long)
              const displayOutput = output.length > MAX_METADATA_LENGTH
                ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n... (output truncated)"
                : output

              context.metadata({
                title: args.description,
                metadata: {
                  output: displayOutput,
                  description: args.description,
                  streaming: true,
                  bytesReceived: output.length,
                },
              })
            }

            proc.stdout?.on("data", append)
            proc.stderr?.on("data", append)

            // Handle abort signal
            const abortHandler = () => {
              aborted = true
              proc.kill("SIGTERM")
            }
            context.abort.addEventListener("abort", abortHandler, { once: true })

            // Timeout handler
            const timeoutTimer = setTimeout(() => {
              timedOut = true
              proc.kill("SIGTERM")
            }, timeout)

            proc.once("exit", (code) => {
              clearTimeout(timeoutTimer)
              context.abort.removeEventListener("abort", abortHandler)

              // Add metadata about completion status
              const resultMetadata: string[] = []
              if (timedOut) {
                resultMetadata.push(`Command terminated after exceeding timeout (${timeout}ms)`)
              }
              if (aborted) {
                resultMetadata.push("Command was aborted by user")
              }

              if (resultMetadata.length > 0) {
                output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
              }

              // Final metadata update
              const displayOutput = output.length > MAX_METADATA_LENGTH
                ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n... (output truncated)"
                : output

              context.metadata({
                title: args.description,
                metadata: {
                  output: displayOutput,
                  description: args.description,
                  streaming: false, // Indicate streaming is complete
                  exitCode: code,
                  timedOut,
                  aborted,
                },
              })

              resolve(output)
            })

            proc.once("error", (error) => {
              clearTimeout(timeoutTimer)
              context.abort.removeEventListener("abort", abortHandler)
              reject(error)
            })
          })
        },
      }),
    },
  }
}

export default StreamingBashPlugin
