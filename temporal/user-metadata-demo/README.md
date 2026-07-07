# UserMetadata Demo

Companion demo for the blog post "[Draft] Label your Agent Steps in the Temporal UI". Runs two pairs of workflows (with and without UserMetadata labels) to show the before/after difference in the Temporal UI.

## Workflows

**Coding agent** (3 iterations of plan/edit/test/evaluate loop):
- `coding-agent-no-labels-v2` - no metadata, timeline shows generic `CallLLM` / `ExecuteTool`
- `coding-agent-with-labels-v2` - labeled with `plan`, `edit_file: main.py`, `run_tests`, `evaluate`, `generate_commit_message`, plus `StaticSummary`, `StaticDetails`, and `SetCurrentDetails`

**Research agent** (plan/search/read/judge/synthesize):
- `research-agent-no-labels-v3` - no metadata
- `research-agent-with-labels-v3` - labeled with `agent_planner`, `tool_call: web_search`, `tool_call: read_document`, `agent_judge`, `agent_synthesizer`, plus a labeled timer `scheduled_recheck: wait for source refresh`

## Prerequisites

- Go 1.21+
- Temporal dev server running on `localhost:7233`
- Temporal UI running on `localhost:3000`

## Run

```bash
cd temporal/user-metadata-demo
go build -o demo .
./demo
```

Then open in the browser:
- `http://localhost:3000/namespaces/default/workflows/coding-agent-no-labels-v2`
- `http://localhost:3000/namespaces/default/workflows/coding-agent-with-labels-v2`
- `http://localhost:3000/namespaces/default/workflows/research-agent-no-labels-v3`
- `http://localhost:3000/namespaces/default/workflows/research-agent-with-labels-v3`

## What to look at

1. **Timeline view** - compare the labeled vs unlabeled workflows side by side
2. **Compact event history** - labels show in purple text on `ActivityTaskScheduledEvent`
3. **User Metadata tab** - shows Summary, Details, and Current Details (Current Details only visible while workflow is running)
4. **Workflow list** - `StaticSummary` shows on the list view for labeled workflows

## Notes

- `SetCurrentDetails` is query-backed and only visible while the workflow is in a running state. Once the workflow completes, the Current Details panel is empty.
- Workflow IDs are hardcoded. To re-run, either bump the version suffix in `main.go` or terminate the existing workflows first.
- Activity sleeps are 2 seconds each to keep the demo quick. Increase them if you want to catch `SetCurrentDetails` mid-execution.
