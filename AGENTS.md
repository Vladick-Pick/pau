<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ПАУ project rules

- Use `pnpm` for all Node commands.
- Use shadcn/ui components from `src/components/ui` before custom UI; follow the base-ui `render` API where a custom trigger is needed.
- For Bitrix24, OpenRouter, Next.js, Prisma, shadcn, or other API/library documentation, use local docs or Context7. Do not use general web search for these docs.
- Prisma is pinned to v6 because Prisma 7 CLI currently fails on the local Node 20.17 runtime.
- Local verification commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Database setup: `docker compose up -d`, `pnpm prisma:generate`, `pnpm prisma:push`, `pnpm db:seed`.
- Main domain code lives under `src/lib/pau`, integration clients under `src/lib/bitrix`, `src/lib/matching`, and `src/lib/briefs`.

## Code Review Graph

- This repository is graph-aware via `code-review-graph`. At the start of code review, debugging, architecture, refactor, or blast-radius work, use the Code Review Graph MCP tools before broad file reads when the graph is available.
- Prefer `get_review_context_tool`, `get_minimal_context_tool`, `get_impact_radius_tool`, `detect_changes_tool`, `semantic_search_nodes_tool`, `query_graph_tool`, `list_flows_tool`, `list_communities_tool`, and `get_architecture_overview_tool` to gather focused context.
- Full CRG tool access is enabled for this project. Use write/refactor tools only when the current task explicitly calls for code changes, then verify the resulting diff and tests normally.
- Treat graph output as retrieval context, not authority. Source files, git diff, local instructions, tests, Prisma/Bitrix/OpenRouter rules, and runtime state win over graph summaries.
- If a CRG tool cannot infer the current repository, pass `repo_root="/Users/vladislavbogdan/Documents/ПАУ"`.

<!-- BEGIN:community-build-platform-contract -->
## Community Build Platform Contract (Mandatory)

This product is registered as `pau` in
[`Community-Build/platform-infra`](https://github.com/Community-Build/platform-infra).
That repository is the source of truth for shared hosting, ingress, product
runtime location, migration state, supported technology profiles, and common
production patterns. This repository remains the source of truth for product
code, domain behavior, tests, and product-specific architecture.

At the start of every task, before planning or editing:

1. Open the current accepted `platform-infra` default branch and read its
   [README](https://github.com/Community-Build/platform-infra/blob/main/README.md).
2. Locate product ID `pau` in the
   [product registry](https://github.com/Community-Build/platform-infra/blob/main/registry/products.yaml).
3. State in the plan or handoff: `Platform impact: none` or
   `Platform impact: paired change <link/path>`.

If the task can change repository custody, runtime, deployment, domain, ingress,
port, secret/config contract, authentication boundary, authoritative data,
schema/migration, backup/restore, external integration writer, observability,
technology profile, or migration status, also read:

- [platform agent rules](https://github.com/Community-Build/platform-infra/blob/main/AGENTS.md);
- [engineering standard](https://github.com/Community-Build/platform-infra/blob/main/docs/ENGINEERING-STANDARDS.md);
- [product lifecycle](https://github.com/Community-Build/platform-infra/blob/main/docs/PRODUCT-LIFECYCLE.md);
- [technology profiles](https://github.com/Community-Build/platform-infra/blob/main/registry/technologies.yaml) and
  [production patterns](https://github.com/Community-Build/platform-infra/blob/main/registry/patterns.yaml).

Such a boundary change requires a paired `platform-infra` change that updates
the owning registry or platform artifact and cross-links the product change.
Do not call the product production-ready, migrated, recoverable, or retired
until the platform record and required evidence agree with live state.

If `platform-infra` is inaccessible, the product record is missing/stale, or
local and platform rules conflict, stop the affected boundary work and request
owner resolution. Do not guess. The baseline guides new work; it does not
authorize a legacy rewrite. An exception requires a product ADR with owner,
risk, verification, and revisit condition.

The platform link does not transfer repository ownership or override customer
organization governance. Secrets, dumps, keys, and personal data never enter
either repository. Merge, deploy, cutover, business acceptance, and old-runtime
retirement are separate actions; deploy, DNS, data, secret, and live-system
changes still require explicit authority.
<!-- END:community-build-platform-contract -->
