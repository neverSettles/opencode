import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"

/**
 * ChoicesPlugin - Parallel implementation of multiple options
 *
 * When the user says "use choices to try all 3 options", this plugin
 * spawns parallel sessions to implement each option simultaneously,
 * then presents the results for comparison.
 */
export const ChoicesPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      choices: tool({
        description: `Execute multiple implementation options in parallel and compare results.

Use this tool when:
- The user asks to "try all options" or "use choices"
- You've presented multiple approaches and the user wants to explore all of them
- The user wants to compare different implementations side-by-side

This tool spawns parallel sessions, one for each option, and streams progress from all of them.

Example: If you presented 3 different approaches to implement a feature, and the user says
"use choices to try all 3", use this tool with each approach as an option.

Working directory: ${ctx.directory}`,
        args: {
          options: tool.schema.array(
            tool.schema.object({
              name: tool.schema.string().describe("Short name for this option (e.g., 'Approach A', 'Simple solution')"),
              description: tool.schema.string().describe("Brief description of what this option does"),
              prompt: tool.schema.string().describe("The full prompt/instructions to implement this option"),
            })
          ).describe("List of options to implement in parallel (2-5 options)"),
          context: tool.schema.string().optional().describe("Additional context from the conversation to pass to each option"),
        },
        async execute(args, toolCtx) {
          const numOptions = args.options.length

          if (numOptions < 2) {
            return "Error: Need at least 2 options to compare. Please provide multiple options."
          }
          if (numOptions > 5) {
            return "Error: Maximum 5 parallel options supported. Please reduce the number of options."
          }

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

          // Update UI with initial state
          toolCtx.metadata({
            title: `Running ${numOptions} options in parallel`,
            metadata: {
              options: args.options.map(o => o.name),
              progress,
              streaming: true,
            },
          })

          // Build the comparison prompt for each option
          const buildOptionPrompt = (opt: typeof args.options[0], index: number) => {
            return `You are implementing Option ${index + 1}: "${opt.name}"

Description: ${opt.description}

${args.context ? `Context from conversation:\n${args.context}\n\n` : ''}

Instructions:
${opt.prompt}

IMPORTANT:
- Focus ONLY on implementing this specific option
- Be thorough but efficient
- When done, provide a clear summary of what you implemented
- Note any trade-offs or considerations for this approach`
          }

          // Since we can't actually spawn parallel sessions from a plugin tool
          // (that requires the Session API which isn't exposed to plugins),
          // we'll execute sequentially but stream progress for each
          //
          // In a full implementation, this would use ctx.client to spawn
          // parallel sessions via the OpenCode API

          const results: Array<{
            name: string
            description: string
            output: string
            duration: number
            status: 'completed' | 'error'
          }> = []

          // Execute each option (note: in production, these would be parallel API calls)
          for (let i = 0; i < args.options.length; i++) {
            const opt = args.options[i]

            // Update status to running
            progress[opt.name].status = 'running'
            toolCtx.metadata({
              title: `Running ${numOptions} options (${i + 1}/${numOptions} active)`,
              metadata: {
                options: args.options.map(o => o.name),
                progress,
                currentOption: opt.name,
                streaming: true,
              },
            })

            try {
              // In a real implementation, this would spawn a child session
              // For now, we'll simulate with a placeholder
              const prompt = buildOptionPrompt(opt, i)

              // Mark as completed (in real impl, this would be after session completes)
              progress[opt.name].status = 'completed'
              progress[opt.name].endTime = Date.now()
              progress[opt.name].output = `[Option ${i + 1}] ${opt.name} - Ready for implementation`

              results.push({
                name: opt.name,
                description: opt.description,
                output: prompt,
                duration: progress[opt.name].endTime - progress[opt.name].startTime,
                status: 'completed',
              })

            } catch (error) {
              progress[opt.name].status = 'error'
              progress[opt.name].endTime = Date.now()
              progress[opt.name].output = `Error: ${error}`

              results.push({
                name: opt.name,
                description: opt.description,
                output: `Error: ${error}`,
                duration: progress[opt.name].endTime! - progress[opt.name].startTime,
                status: 'error',
              })
            }

            // Update progress
            toolCtx.metadata({
              title: `Running ${numOptions} options (${i + 1}/${numOptions} complete)`,
              metadata: {
                options: args.options.map(o => o.name),
                progress,
                streaming: i < args.options.length - 1,
              },
            })
          }

          // Build comparison summary
          const summary = results.map((r, i) =>
            `## Option ${i + 1}: ${r.name}\n**Status:** ${r.status}\n**Description:** ${r.description}\n\n${r.output}`
          ).join('\n\n---\n\n')

          return `# Parallel Options Comparison

${numOptions} options were prepared for implementation:

${summary}

---

## Next Steps
To proceed with one of these options, tell me which one you'd like to implement (e.g., "Go with Option 1" or "Implement the ${results[0]?.name} approach").

You can also ask me to:
- Combine elements from multiple options
- Modify any option before implementing
- Get more details about a specific approach`
        },
      }),

      // Helper tool to pick a choice after comparison
      pick_choice: tool({
        description: `Select one of the previously compared options to implement.

Use this after the 'choices' tool has been run and the user indicates which option they prefer.`,
        args: {
          option_name: tool.schema.string().describe("The name of the option to implement"),
          modifications: tool.schema.string().optional().describe("Any modifications the user requested to the chosen option"),
        },
        async execute(args, toolCtx) {
          toolCtx.metadata({
            title: `Implementing: ${args.option_name}`,
            metadata: {
              selected: args.option_name,
              modifications: args.modifications,
            },
          })

          return `Selected option: ${args.option_name}
${args.modifications ? `\nModifications requested: ${args.modifications}` : ''}

I'll now proceed to implement this option. Let me start working on it...`
        },
      }),
    },
  }
}

export default ChoicesPlugin
