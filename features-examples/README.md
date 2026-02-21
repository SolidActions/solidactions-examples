# Features Examples

This project contains 15 workflows demonstrating SolidActions SDK features. Each example is a standalone workflow file that showcases one specific capability.

## Examples

| Workflow | File | What It Demonstrates | Key SDK Methods |
|----------|------|---------------------|-----------------|
| Simple Steps | `src/simple-steps.ts` | Basic multi-step workflow pattern with env vars | `runStep()` |
| Sleep Workflow | `src/sleep-workflow.ts` | Long-running waits that persist across restarts | `sleep()` |
| Parent Child | `src/parent-child.ts` | Spawning and awaiting child workflows | `startWorkflow()`, `getResult()` |
| Child Task | `src/child-task.ts` | Internal workflow spawned by parents | `registerWorkflow()` (no `run()`) |
| Invoice Approval | `src/invoice-approval.ts` | Human approval with approve/reject URLs | `getSignalUrls()`, `recv()` |
| Retry Workflow | `src/retry-workflow.ts` | Fault-tolerant step execution with backoff | `runStep()` with retry config |
| Scheduled Workflow | `src/scheduled-workflow.ts` | Periodic task execution via cron | YAML `trigger: schedule` |
| Event Workflow | `src/event-workflow.ts` | Progress tracking with events | `setEvent()`, `getEvent()` |
| Parallel Steps | `src/parallel-steps.ts` | Concurrent execution | `Promise.allSettled()` + `runStep()` |
| Message Receiver | `src/message-receiver.ts` | Async messaging entry point | `startWorkflow()`, `recv()` |
| Message Sender | `src/message-sender.ts` | Async messaging worker | `send()` |
| Multistep Parent | `src/multistep-parent.ts` | Complex parent spawning a multi-step child | `startWorkflow()`, `getResult()` |
| Multistep Child | `src/multistep-child.ts` | Internal child with 4 sequential steps | `registerWorkflow()`, `runStep()` |
| OAuth Workflow | `src/oauth-workflow.ts` | OAuth connection mapping to env vars | `process.env` token access |
| Respond Test | `src/respond-test.ts` | Early webhook response before workflow completes | `respond()` |

## Setup

```bash
npm install
```

Configure `.env` (copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env with your values
```

## Deploy

```bash
solidactions deploy features-examples features-examples
```

## Running Examples

```bash
# Simple steps
solidactions run features-examples simple-steps -i '{"taskId": "test-1", "value": 42}' -w

# Sleep workflow (durable sleep)
solidactions run features-examples sleep-workflow -i '{"taskId": "sleep-1", "sleepMs": 5000}' -w

# Invoice approval (will wait for human action)
solidactions run features-examples invoice-approval -i '{"requestId": "req-1", "requester": "Alice", "amount": 500, "description": "Office supplies"}' -w

# Parent-child
solidactions run features-examples parent-child -i '{"value": 7, "operation": "square"}' -w

# Retry workflow (60% simulated failure rate)
solidactions run features-examples retry-workflow -i '{"taskId": "retry-1", "failureRate": 0.6}' -w

# Event workflow (progress tracking)
solidactions run features-examples event-workflow -i '{"items": ["item-a", "item-b", "item-c"]}' -w

# Parallel steps (items prefixed with "fail-" will error)
solidactions run features-examples parallel-steps -i '{"items": ["a", "b", "fail-c", "d"]}' -w

# Messaging (receiver triggers sender automatically)
solidactions run features-examples message-receiver -i '{"data": "hello world"}' -w

# Multistep parent (spawns multistep-child with 4 steps)
solidactions run features-examples multistep-parent -i '{"value": 10}' -w

# OAuth workflow (requires connection setup in SA UI)
solidactions run features-examples oauth-workflow -i '{"provider": "github"}' -w

# Respond test (use the webhook URL directly or via CLI)
solidactions run features-examples respond-test -i '{"taskId": "wh-1", "data": "test data"}' -w
```

## Notes

- **OAuth**: Requires creating a connection in the SolidActions UI and mapping the token to a project variable. See `src/oauth-workflow.ts` for setup instructions.
- **Messaging**: The receiver triggers the sender automatically — you only need to run the receiver.
- **Scheduled Workflow**: Requires deployment to run on its cron schedule. The schedule is configured in `solidactions.yaml`.
- **Respond Test**: Configured with `response: wait` and `auth: none` in `solidactions.yaml` for easy testing.
- **Child Task / Multistep Child**: Internal workflows — tested via their respective parents.
