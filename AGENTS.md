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
