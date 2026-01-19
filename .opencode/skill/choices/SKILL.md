---
name: choices
description: Use when user wants to explore multiple implementation options in parallel, compare approaches, or says "try all options" or "use choices"
---

# Choices Skill

This skill helps you explore multiple implementation approaches simultaneously.

## When to Use

Use the `choices` tool when:

1. **User explicitly requests it:**
   - "Use choices to try all 3"
   - "Try all options"
   - "Explore all approaches"
   - "Implement all of them so I can compare"

2. **You've presented multiple options and user wants to compare:**
   - You suggested 2-5 different approaches
   - User says "do all of them" or "let me see all options"

3. **User wants side-by-side comparison:**
   - "Which one is better? Show me both"
   - "Implement them all and let me pick"

## How to Use

### Step 1: Identify the Options

From the conversation, extract each distinct option with:
- **name**: Short identifier (e.g., "Redis Cache", "Simple Approach")
- **description**: What this option does
- **prompt**: Full implementation instructions

### Step 2: Call the choices tool

```json
{
  "options": [
    {
      "name": "Option A",
      "description": "Uses Redis for distributed caching",
      "prompt": "Implement a caching layer using Redis..."
    },
    {
      "name": "Option B",
      "description": "Uses in-memory LRU cache",
      "prompt": "Implement an in-memory LRU cache..."
    }
  ],
  "context": "User wants to improve API response times..."
}
```

### Step 3: After user picks an option

Use the `pick_choice` tool when user says things like:
- "Go with option 1"
- "Use the Redis approach"
- "Implement the second one"

## Example Conversation

```
User: How should I implement user authentication?