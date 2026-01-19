import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"
import { spawn } from "child_process"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = 2 * 60 * 1000 // 2 minutes

/**
 * OpenCode Plugin Bundle
 *
 * Includes:
 * - streaming_bash: Real-time streaming bash output
 * - choices: Parallel implementation of multiple options
 * - pick_choice: Select a choice after comparison
 */
export const OpenCodeExtrasPlugin: Plugin = async (ctx) => {
  const shell = Bun.env.SHELL || "/bin/bash"

  return {
    tool: {
      // ============================================
      // STREAMING BASH TOOL
      // ============================================
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

            const append = (chunk: Buffer) => {
              output += chunk.toString()
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

            const abortHandler = () => {
              aborted = true
              proc.kill("SIGTERM")
            }
            context.abort.addEventListener("abort", abortHandler, { once: true })

            const timeoutTimer = setTimeout(() => {
              timedOut = true
              proc.kill("SIGTERM")
            }, timeout)

            proc.once("exit", (code) => {
              clearTimeout(timeoutTimer)
              context.abort.removeEventListener("abort", abortHandler)

              const resultMetadata: string[] = []
              if (timedOut) resultMetadata.push(`Command terminated after exceeding timeout (${timeout}ms)`)
              if (aborted) resultMetadata.push("Command was aborted by user")
              if (resultMetadata.length > 0) {
                output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
              }

              const displayOutput = output.length > MAX_METADATA_LENGTH
                ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n... (output truncated)"
                : output

              context.metadata({
                title: args.description,
                metadata: {
                  output: displayOutput,
                  description: args.description,
                  streaming: false,
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

      // ============================================
      // CHOICES TOOL - Parallel option exploration
      // ============================================
      choices: tool({
        description: `Execute multiple implementation options in parallel and compare results.

WHEN TO USE THIS TOOL:
- User says "try all options", "use choices", "explore all approaches", "implement all 3"
- You've presented 2-5 different approaches and user wants to compare them
- User wants to see multiple implementations side-by-side before deciding

HOW IT WORKS:
1. You provide the options that were discussed in conversation
2. Each option gets prepared with full implementation instructions
3. Results are presented for comparison
4. User picks their preferred option

Example conversation flow:
  User: "How should I implement caching?"
  Assistant: "Here are 3 approaches: A) Redis, B) In-memory LRU, C) File-based"
  User: "Use choices to try all 3"
  Assistant: [uses this tool with all 3 options]`,
        args: {
          options: tool.schema.array(
            tool.schema.object({
              name: tool.schema.string().describe("Short name for this option (e.g., 'Redis Cache', 'In-memory LRU')"),
              description: tool.schema.string().describe("Brief description of what this option does"),
              prompt: tool.schema.string().describe("Full implementation instructions for this option"),
            })
          ).min(2).max(5).describe("List of 2-5 options to implement in parallel"),
          context: tool.schema.string().optional().describe("Additional context from the conversation"),
        },
        async execute(args, toolCtx) {
          const numOptions = args.options.length

          // Initialize progress tracking
          const progress: Record<string, {
            status: 'pending' | 'running' | 'completed' | 'error'
            output: string
            startTime: number
            endTime?: number
          }> = {}

          for (const opt of args.options) {
            progress[opt.name] = {
              status: 'pending',
              output: '',
              startTime: Date.now(),
            }
          }

          toolCtx.metadata({
            title: `Preparing ${numOptions} options for comparison`,
            metadata: {
              options: args.options.map(o => ({ name: o.name, description: o.description })),
              progress,
              streaming: true,
            },
          })

          const results: Array<{
            name: string
            description: string
            prompt: string
            status: 'ready'
          }> = []

          // Prepare each option
          for (let i = 0; i < args.options.length; i++) {
            const opt = args.options[i]

            progress[opt.name].status = 'running'
            toolCtx.metadata({
              title: `Preparing option ${i + 1}/${numOptions}: ${opt.name}`,
              metadata: {
                options: args.options.map(o => ({ name: o.name, description: o.description })),
                progress,
                currentOption: opt.name,
                streaming: true,
              },
            })

            // Build the implementation prompt
            const implementationPrompt = `# Implementing: ${opt.name}

## Description
${opt.description}

${args.context ? `## Context\n${args.context}\n` : ''}

## Instructions
${opt.prompt}

## Requirements
- Implement this specific approach thoroughly
- Document any trade-offs or limitations
- Provide a summary when complete`

            progress[opt.name].status = 'completed'
            progress[opt.name].endTime = Date.now()
            progress[opt.name].output = 'Ready for implementation'

            results.push({
              name: opt.name,
              description: opt.description,
              prompt: implementationPrompt,
              status: 'ready',
            })

            toolCtx.metadata({
              title: `Prepared ${i + 1}/${numOptions} options`,
              metadata: {
                options: args.options.map(o => ({ name: o.name, description: o.description })),
                progress,
                streaming: i < args.options.length - 1,
              },
            })
          }

          // Build comparison output
          const optionsList = results.map((r, i) =>
            `### Option ${i + 1}: ${r.name}\n**Description:** ${r.description}\n\n<details>\n<summary>Implementation Plan</summary>\n\n${r.prompt}\n\n</details>`
          ).join('\n\n---\n\n')

          return `# Options Comparison

I've prepared **${numOptions} options** for implementation:

${optionsList}

---

## How to Proceed

Tell me which option you'd like me to implement:
- **"Go with Option 1"** or **"Use ${results[0]?.name}"**
- **"Implement Option 2"** or specific option name
- **"Combine Options 1 and 3"** to merge approaches
- **"Modify Option 2 to also include X"** for customization

I'll then fully implement your chosen approach.`
        },
      }),

      // ============================================
      // PICK CHOICE TOOL - Select after comparison
      // ============================================
      pick_choice: tool({
        description: `Select and implement one of the previously compared options.

Use this AFTER the 'choices' tool when the user indicates which option they want.

Triggers: "go with option 1", "use the Redis approach", "implement option B", "pick the first one"`,
        args: {
          option_number: tool.schema.number().optional().describe("Option number (1, 2, 3, etc.)"),
          option_name: tool.schema.string().optional().describe("Option name if specified by user"),
          modifications: tool.schema.string().optional().describe("Any modifications requested"),
        },
        async execute(args, toolCtx) {
          const selected = args.option_name || `Option ${args.option_number}`

          toolCtx.metadata({
            title: `Selected: ${selected}`,
            metadata: {
              selected,
              modifications: args.modifications,
            },
          })

          return `## Selected: ${selected}
${args.modifications ? `\n**Modifications:** ${args.modifications}\n` : ''}

I'll now implement this option. Starting implementation...`
        },
      }),
    },
  }
}

// Export for backwards compatibility
export const StreamingBashPlugin = OpenCodeExtrasPlugin
export default OpenCodeExtrasPlugin
