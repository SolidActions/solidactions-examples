# SolidActions Examples Repository - Quick PRD

Create a clone-and-go examples repository for SolidActions, a TypeScript workflow automation platform. The repo serves as the primary onboarding resource for new users, providing working example projects, comprehensive AI developer instructions (CLAUDE.md), and a visual workflow guide (Mermaid diagram) covering the full lifecycle from project setup through production deployment. The CLAUDE.md must be batteries-included — an AI agent reading it should be able to write complete SolidActions projects without any other docs.

The repo contains three top-level project folders. **hello-world/** is a multi-step starter project showing the basic SolidActions pattern. **features-examples/** contains 11 workflow files each demonstrating one SDK capability: sequential steps, durable sleep, external signals/approvals, parent/child workflows, retries with exponential backoff, scheduled cron workflows, events/progress tracking, parallel steps, workflow-to-workflow messaging, OAuth token injection, and custom webhook responses. **google-calendar-sync/** is a placeholder for a future project. All examples use TypeScript with the new `SolidActions.*` API (not legacy `SOLID.*`), `@solidactions/sdk`, and follow standard project structure: `package.json`, `solidactions.yaml`, `tsconfig.json`, `.env.example`, and `src/` directory.

The workflow.md document uses a Mermaid diagram grouped into four phases: Setup (create folder, add CLAUDE.md, install CLI, get API key, init), Develop (plan with AI, write code, configure .env), Test (test locally, push env vars to SA, deploy to dev, test on SA), and Deploy (setup production env vars, push to production). Out of scope: legacy API examples, slow-workflow, small-business examples, frontend code, and CI/CD automation.

---

*Generated with Clavix Planning Mode*
*Generated: 2026-02-19*
