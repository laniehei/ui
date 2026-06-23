# LLM Observability Demo

Branch: `lanie/ai-observability`

This directory contains demo workflows and activities used to prototype the [First-class AI metadata](https://www.notion.so/temporalio/First-class-AI-metadata-3748fc56773880ab9fe6fcf300962f9d) UI experience. The activities simulate LLM calls with hardcoded responses and metadata.

## How LLM metadata works in this demo

The [1-pager](https://www.notion.so/temporalio/First-class-AI-metadata-3748fc56773880ab9fe6fcf300962f9d) proposes a new `ActivityCompletionDetails` proto on `ActivityTaskCompletedEventAttributes` with a typed `LLMCallDetails` sub-message (model, tokens, cost, latency, trace URL). Developers would call `activity.set_completion_details()` and the data would be written to a proto field outside the payload pipeline.

That proto does not exist yet. This demo fakes it by returning a `_details` key in the activity result payload so the UI prototype can read and render the metadata. Once the SDK team adds `ActivityCompletionDetails` to the proto, the activities and UI should be updated to use the real field.

## Running the demo

This demo requires the prototype UI branch, a local Temporal server, and the demo workflows. The UI branch includes LLM-specific rendering (compact view with model badges, chat tab, A/B comparison) that the stock Temporal UI does not have.

### Prerequisites

- Node.js 18+
- pnpm
- Temporal CLI (`brew install temporal` or see [docs](https://docs.temporal.io/cli))
- This repo checked out on the `lanie/ai-observability` branch
- (Optional) `BRAINTRUST_API_KEY` in your environment for trace URL integration

### Steps

1. Start a Temporal dev server. If you already have one running, skip this step.

```bash
temporal server start-dev
```

2. Install dependencies and start the prototype UI (from repo root).

```bash
pnpm install
pnpm dev
```

The UI starts on a local port (check the terminal output, typically `http://localhost:3001/`). The `pnpm dev` command also tries to start its own Temporal server. If one is already running on port 7233, you'll see a port conflict error in the logs. This is safe to ignore - the UI connects to the existing server.

3. In a separate terminal, run the demo workflows (from repo root).

```bash
node_modules/.bin/esno temporal/run-llm-demo.ts
```

4. Open the UI and navigate to the default namespace workflows page. You should see:
   - `llm-workflow-run-a-v2` and `llm-workflow-run-b-v2` (A/B comparison pair)
   - `chat-session-user-123` (multi-turn agent session)

## What the demo runs

`run-llm-demo.ts` starts two sets of workflows:

**A/B comparison pair** (`llm-workflow-run-a-v2`, `llm-workflow-run-b-v2`):
Each runs `LLMWorkflow` with a different prompt. 10 activities per workflow:
- `callLLM` (gpt-4o), `callLLMClaude` (claude-3-5-sonnet), `callLLMGemini` (gemini-1.5-pro)
- `callLLMFlaky` (gpt-4o) - fails on first attempt, succeeds on retry
- `echo` - non-LLM activities (system messages in chat view)

**Chat session** (`chat-session-user-123`):
3 sequential workflow executions simulating a multi-turn agent conversation:
- Turn 1: guardrail, LLM call, guardrail
- Turn 2: LLM call, knowledge base search, LLM synthesis, guardrail
- Turn 3: LLM planning, confirmation, tool execution (child workflow), summary

## Braintrust integration

`workers.ts` optionally wires in the Braintrust plugin if `BRAINTRUST_API_KEY` is set. The plugin does two things automatically:

1. **Serializes span context into workflow headers** (`_braintrust-span` key) so Braintrust can build a trace tree across client, workflow, and activity boundaries
2. **Creates spans** for each workflow and activity execution and flushes them to the Braintrust API

To populate `trace_url`, the activity code explicitly grabs the permalink from the current Braintrust span:

```ts
import { currentSpan } from "braintrust";

const traceUrl = await currentSpan().permalink();
setCompletionDetails({
  llm: {
    model: "gpt-4o",
    promptTokens: 150,
    cost: 0.012,
    traceUrl,
  },
});
```

`currentSpan()` returns the Braintrust span the plugin created for this activity. `.permalink()` returns the URL to view that span in Braintrust's web UI. The activity passes it to `set_completion_details()` so the Temporal UI can render it as a clickable link.

The trace URL is not injected automatically. The developer calls `currentSpan().permalink()` and attaches it. This is intentional: `trace_url` works with any observability tool (Langfuse, LangSmith, Arize), not just Braintrust. Each tool has its own way of getting a span permalink.

The `set_completion_details()` simulation lives in this directory:
- `completion-details.ts` - `setCompletionDetails()` API and `LLMCallDetails` interface
- `details-interceptor.ts` - interceptor that attaches details to the activity result (temporary, until the proto exists)

## What to look at in the UI

- **Compact view**: activity names, duration, LLM badges (model, tokens, cost) from `_details`
- **Chat tab**: input/output bubble view with activity headers
- **A/B comparison**: select both workflows, click Compare for side-by-side diff
- **Retry badge**: `callLLMFlaky` shows "Attempt 2" warning
- **Child workflow**: Turn 3's `ToolExecutionWorkflow` appears as an expandable node

## Files

| File | Purpose |
|------|---------|
| `run-llm-demo.ts` | Entry point. Starts A/B workflows and chat session |
| `workers.ts` | Worker setup with optional Braintrust plugin |
| `client.ts` | Client connection and workflow start helpers |
| `workflows.ts` | `LLMWorkflow`, `ChatSessionWorkflow`, `ToolExecutionWorkflow` |
| `activities/call-llm.ts` | Simulated gpt-4o activity |
| `activities/call-llm-claude.ts` | Simulated claude-3-5-sonnet activity |
| `activities/call-llm-gemini.ts` | Simulated gemini-1.5-pro activity |
| `activities/call-llm-flaky.ts` | Simulated gpt-4o that fails once (retry demo) |
| `activities/run-guardrail.ts` | Simulated guardrail check |
| `activities/search-knowledge-base.ts` | Simulated RAG search |
| `activities/execute-tool.ts` | Simulated tool execution |
| `completion-details.ts` | `setCompletionDetails()` API simulation (AsyncLocalStorage) |
| `details-interceptor.ts` | Interceptor that attaches details to activity result (temporary) |
| `data-converter.ts` | Data converter setup |
| `codec-server.ts` | Codec server for encryption demo |
| `payload-codec.ts` | Payload codec implementation |

## Related

- [First-class AI metadata 1-pager](https://www.notion.so/temporalio/First-class-AI-metadata-3748fc56773880ab9fe6fcf300962f9d)
- [Agentic Observability 1-pager](https://www.notion.so/temporalio/Agentic-Observability-31f8fc56773880618801e6e260376284)
- [Prototype doc](https://www.notion.so/temporalio/UI-Prototype-LLM-Observability-32f8fc56773881559f24c32bd0681de5)
