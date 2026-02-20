# Features Examples

This project contains 11 examples demonstrating SolidActions SDK features. Each example is a standalone workflow file that showcases one specific capability.

## Examples

| Workflow | File | What It Demonstrates | Key SDK Methods |
|----------|------|---------------------|-----------------|
| Sequential Steps | `src/sequential-steps.ts` | Basic multi-step workflow pattern | `runStep()` |
| Durable Sleep | `src/durable-sleep.ts` | Long-running waits that persist across restarts | `sleep()` |
| Approval Signal | `src/approval-signal.ts` | Human approval with approve/reject URLs | `getSignalUrls()`, `recv()` |
| Parent-Child | `src/parent-child.ts` | Spawning and awaiting child workflows | `startWorkflow()`, `getResult()` |
| Child Workflow | `src/child-workflow.ts` | Internal workflow spawned by parents | `registerWorkflow()` (no `run()`) |
| Retry Backoff | `src/retry-backoff.ts` | Fault-tolerant step execution | `runStep()` with retry config |
| Scheduled Cron | `src/scheduled-cron.ts` | Periodic task execution via cron | YAML `trigger: schedule` |
| Events Progress | `src/events-progress.ts` | Progress tracking with events | `setEvent()`, `getEvent()` |
| Parallel Steps | `src/parallel-steps.ts` | Concurrent execution | `Promise.allSettled()` + `runStep()` |
| Messaging Receiver | `src/messaging-receiver.ts` | Async messaging entry point | `startWorkflow()`, `recv()` |
| Messaging Sender | `src/messaging-sender.ts` | Async messaging worker | `send()` |
| OAuth Tokens | `src/oauth-tokens.ts` | OAuth connection mapping to env vars | `process.env` token access |
| Webhook Response | `src/webhook-response.ts` | Controlling HTTP responses | `respond()` |

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
solidactions deploy features-examples
```

## Running Examples

```bash
# Sequential steps
solidactions run features-examples sequential-steps -i '{"taskId": "test-1", "value": 42}' -w

# Durable sleep (5 second sleep)
solidactions run features-examples durable-sleep -i '{"taskId": "sleep-1", "sleepMs": 5000}' -w

# Approval signal (will wait for human action)
solidactions run features-examples approval-signal -i '{"requestId": "req-1", "requester": "Alice", "amount": 500, "description": "Office supplies"}' -w

# Parent-child
solidactions run features-examples parent-child -i '{"value": 7, "operation": "square"}' -w

# Retry backoff (60% simulated failure rate)
solidactions run features-examples retry-backoff -i '{"taskId": "retry-1", "failureRate": 0.6}' -w

# Events progress
solidactions run features-examples events-progress -i '{"items": ["item-a", "item-b", "item-c"]}' -w

# Parallel steps (items prefixed with "fail-" will error)
solidactions run features-examples parallel-steps -i '{"items": ["a", "b", "fail-c", "d"]}' -w

# Messaging (receiver triggers sender automatically)
solidactions run features-examples messaging-receiver -i '{"data": "hello world"}' -w

# OAuth tokens (requires connection setup in SA UI)
solidactions run features-examples oauth-tokens -i '{"provider": "github"}' -w

# Webhook response (use the webhook URL directly or via CLI)
solidactions run features-examples webhook-response -i '{"taskId": "wh-1", "data": "test data"}' -w
```

## Notes

- **OAuth**: Requires creating a connection in the SolidActions UI and mapping the token to a project variable. See `src/oauth-tokens.ts` for setup instructions.
- **Messaging**: The receiver triggers the sender automatically — you only need to run the receiver.
- **Scheduled Cron**: Requires deployment to run on its cron schedule. The schedule is configured in `solidactions.yaml`.
- **Webhook Response**: Configured with `response: wait` and `auth: none` in `solidactions.yaml` for easy testing.
