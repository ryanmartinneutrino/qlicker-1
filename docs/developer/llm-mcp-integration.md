# LLM + MCP Integration Notes

This guide describes practical ways to let an LLM answer questions about Qlicker data (attendance risk, student question-type weakness, and rubric-based short-answer grading).

## Short answer

Yes, you can connect an LLM to the Qlicker API.

You have two common integration paths:

1. **Tool-calling app without MCP**: your app gives the LLM explicit tools (HTTP calls) backed by Qlicker REST endpoints.
2. **MCP server in front of Qlicker**: expose Qlicker capabilities as MCP tools/resources, then let MCP-compatible clients use them.

Either path works. MCP is usually best when you want the same data/actions to be reused by multiple AI clients.

## Recommended architecture for Qlicker

Use a thin **AI orchestration service** between the model and Qlicker:

- Authenticates to Qlicker with a scoped service account.
- Calls Qlicker REST APIs and (optionally) listens to WebSocket events.
- Applies data-minimization and FERPA/privacy filtering.
- Provides deterministic analytics helpers (attendance trend math, per-question-type aggregates).
- Sends only the minimum needed context to the LLM.

This keeps your LLM integration stateless and avoids exposing raw student data directly to prompts.

## When to use MCP

Use an MCP server if you want:

- standardized tool contracts for multiple LLM clients
- reusable capabilities across ChatGPT/Claude/Cursor/etc.
- consistent policy enforcement in one place

Skip MCP (initially) if:

- you only need one internal assistant
- you want a faster first implementation

A practical sequence is:

1. Build orchestration service + direct tools first.
2. Wrap those same capabilities behind MCP once workflows stabilize.

## Capability mapping (examples)

### "Which students are showing a drop in attendance?"

Implement a deterministic tool that:

1. pulls enrollment + session participation records
2. computes trailing attendance windows (for example last 3 vs prior 3 sessions)
3. returns students below a threshold with confidence labels

Let the LLM explain the results, but keep the trend calculation deterministic.

### "What type of questions does this student struggle with?"

Implement a tool that:

1. aggregates historical scores by question type (MCQ, numeric, short answer, etc.)
2. tracks recency-weighted performance and attempt counts
3. returns weak categories with evidence counts

Again, do scoring math outside the LLM.

### "Grade all question 3 short answers using this rubric"

Implement a grading workflow with guardrails:

1. retrieve all target responses for question 3
2. send rubric + anonymized response text to grading model
3. require structured output (score, rationale, rubric-criterion evidence)
4. support batch review + human override before final publish
5. write provisional grades/feedback back through Qlicker grade endpoints

For reliability and fairness, keep human-in-the-loop for high-stakes grading.

## Security and governance checklist

- Use least-privilege service credentials.
- Log every model/tool call with who asked and what data scope was used.
- Add redaction for PII where not strictly needed.
- Keep model outputs as drafts unless explicitly approved.
- Version prompts/rubrics and keep audit trails.
- Add evaluation sets for bias/hallucination regression checks.

## Qlicker API fit

Qlicker already exposes REST route groups and generated OpenAPI docs at `/docs` and `/docs/json`, making tool generation straightforward.

Start by mapping high-value read-only endpoints to analytics tools, then add write actions (for rubric grading) with explicit approval steps.
