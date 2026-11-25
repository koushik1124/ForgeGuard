# ForgeGuard Developer Console (`dashboard/`)

**ForgeGuard** — Control. Recover. Observe. Evaluate.  
*Reliable AI Agent Execution Runtime*

This directory contains the premium developer console for ForgeGuard. Built as a high-density, dark-first operations dashboard inspired by Linear, Vercel, and Grafana, it serves as the command center for monitoring governed AI agent executions, policy decisions, budget utilization, durable checkpoints, and runtime health.

---

## Technology Stack

- **Framework**: React 18 with TypeScript (Strict mode enabled)
- **Build Tool**: Vite 6
- **UI & Design System**: Material UI v6 (`@mui/material`), `@emotion/react`, `@emotion/styled`
- **Iconography**: `lucide-react`
- **State Management**: Zustand v5 (in-memory by default, opt-in local persistence)
- **Data Fetching & Cache**: TanStack React Query v5
- **Validation**: Zod v3
- **Testing**: Vitest v3, React Testing Library, `@testing-library/jest-dom`, JSDOM

---

## Design System & Aesthetic Principles

- **Dark-First Infrastructure Palette**:
  - Background: `#0B0D12` (deep obsidian canvas)
  - Sidebar: `#10131A` (structural slate)
  - Surface Primary / Cards: `#151922` (subtle elevation)
  - Surface Elevated / Modals: `#1B202B` (prominent surface)
  - Borders: `#262D39` (crisp division) and `#1E242E` (subtle dividers)
  - Accent Primary: `#7C8CFF` (refined violet-blue)
  - Success: `#35C98A` (mint emerald)
  - Warning: `#F0B45A` (amber gold)
  - Error: `#F16C78` (coral rose)
  - Text: `#E6E8EC` (primary), `#ADB5C2` (secondary), `#929BAC` (muted), `#5B6473` (subtle/disabled)
- **Typography**:
  - Interface: `Inter`, system sans-serif fallback
  - Data / IDs / Coordinates: `JetBrains Mono`, monospace
- **Information Architecture**:
  - High information density without visual clutter
  - Clean monospaced styling for task IDs, durations, timestamps, and memory counters
  - Honest status representations (`--` and explicit `Unavailable` badges when the runtime API is disconnected)
  - Zero fabricated statistics or misleading placeholder counters

---

## Directory Structure

```
dashboard/
├── index.html                  # HTML entry point with fonts & dark theme root
├── package.json                # Frontend dependencies & npm scripts
├── tsconfig.json               # TypeScript configuration with path aliases (@/*)
├── vite.config.ts              # Vite configuration with Vitest integration
├── public/
│   └── favicon.svg             # Custom ForgeGuard shield vector icon
└── src/
    ├── main.tsx                # React DOM entry point
    ├── App.tsx                 # Root component with QueryClient, ThemeProvider, Routes
    ├── api/
    │   ├── types.ts            # TypeScript contracts mirroring M8 REST API schemas
    │   ├── client.ts           # Unified API client with timeout, auth, normalized errors
    │   └── hooks.ts            # TanStack Query hooks (useHealth, useReadiness, useTasks)
    ├── theme/
    │   ├── tokens.ts           # Central design tokens (colors, typography, layout)
    │   └── theme.ts            # MUI custom dark theme overrides
    ├── stores/
    │   ├── connectionStore.ts  # Runtime API connection configuration & live state
    │   └── uiStore.ts          # Sidebar collapse, drawer, and notification snackbars
    ├── components/
    │   ├── common/             # Reusable UI primitives
    │   │   ├── BrandLogo.tsx           # Shield icon + wordmark + subtitle
    │   │   ├── ConnectionIndicator.tsx # Live API connection pill badge
    │   │   ├── StatusBadge.tsx         # Task lifecycle status badges
    │   │   ├── PageHeader.tsx          # Consistent view header with action slots
    │   │   ├── Panel.tsx               # Structural card container
    │   │   ├── MetricCard.tsx          # Key metric display with loading & offline states
    │   │   ├── DataTable.tsx           # Generic high-density data table
    │   │   ├── EmptyState.tsx          # Empty view illustration & actions
    │   │   ├── ErrorState.tsx          # Error boundary / failure view
    │   │   ├── LoadingSkeleton.tsx     # Skeleton placeholders for async states
    │   │   └── SectionHeading.tsx      # Form and panel section headings
    │   ├── dialogs/
    │   │   └── ConfirmationDialog.tsx  # Modal confirmation dialog
    │   ├── live/               # M9.4 Live SSE & Event streaming components
    │   │   ├── LiveExecutionInspector.tsx # Real-time event stream viewer & paused buffer
    │   │   ├── EventTimelineItem.tsx      # Chronological event row with payload viewer
    │   │   └── ToolCallVisualization.tsx  # Correlated tool call execution card
    │   ├── governance/         # M9.5 Policy & Budget Inspector components
    │   │   ├── GovernanceInspector.tsx    # Governance container with Policy & Budget tabs
    │   │   ├── PolicyInspector.tsx        # Allow/Deny ledger with rule & execution correlation
    │   │   └── BudgetInspector.tsx        # Resource limits, utilization cards, & exhaustion alerts
    │   ├── recovery/           # M9.6 Recovery & Diagnostics components
    │   │   ├── RecoveryInspector.tsx      # Diagnostics container with Trace ID & tab switcher
    │   │   ├── RecoveryAssessmentBanner.tsx # Safe resumability banner & guarded action trigger
    │   │   ├── FailureDiagnosticsCard.tsx   # Categorized failure diagnostics & remediation guidance
    │   │   ├── RecoveryTimeline.tsx       # Deterministic forensic execution timeline
    │   │   └── CheckpointForensicsCard.tsx # Reconstructed state & preserved tool execution ledger
    │   ├── workspace/          # M9.7.1 Workspace Explorer components
    │   │   ├── RegisterWorkspaceDialog.tsx # Safe directory registration modal
    │   │   ├── FileBrowser.tsx            # High-density directory tree with breadcrumb navigation
    │   │   └── FilePreviewModal.tsx       # Read-only text preview with sensitive file guards
    │   └── layout/
    │       ├── AppShell.tsx            # Main shell: Sidebar + Topbar + Content
    │       ├── Sidebar.tsx             # Collapsible navigation sidebar
    │       ├── SidebarSection.tsx      # Sidebar category headings
    │       ├── NavigationItem.tsx      # Route navigation link with active state
    │       ├── Topbar.tsx              # Top navigation, breadcrumbs, status, actions
    │       └── NotificationSnackbar.tsx# Global toast alerts
    ├── pages/
    │   ├── DashboardPage.tsx   # Overview dashboard with live metrics & task list
    │   ├── TaskExplorerPage.tsx# Task browsing, search, status filter & pagination
    │   ├── TaskDetailPage.tsx  # Live SSE, Governance, Recovery & Task forensics
    │   ├── WorkspaceListPage.tsx # M9.7.1 Workspace Explorer & directory registry
    │   ├── WorkspaceDetailPage.tsx # M9.7.1 Filesystem browser & boundary details
    │   ├── SettingsPage.tsx    # Connection configuration, auth key, live tester
    │   ├── PlaceholderPage.tsx # Standardized upcoming milestone roadmaps
    │   └── NotFoundPage.tsx    # 404 view with return navigation
    └── test/
        ├── setup.ts            # Vitest + RTL setup with jest-dom
        ├── test-utils.tsx      # Providers wrapper for isolated testing
        ├── App.test.tsx        # Shell rendering & route resolution tests
        ├── Navigation.test.tsx # Sidebar sections, links, and collapse tests
        ├── Settings.test.tsx   # URL validation, connection mock tests, reset
        ├── Components.test.tsx # MetricCard, DataTable, StatusBadge unit tests
        ├── OverviewIntegration.test.tsx # M9.2 Backend integration & activity tests
        ├── TaskExplorer.test.tsx # M9.3 Task browsing, search, status filter & pagination tests
        ├── TaskDetail.test.tsx   # M9.3 Task state, prompt, result, diagnostics & actions tests
        ├── sseParser.test.ts     # M9.4 W3C SSE frame parser unit tests
        ├── sseStreamClient.test.ts # M9.4 EventStreamClient & reconnection tests
        ├── sseNormalizer.test.ts # M9.4 SSE event normalizer tests
        ├── LiveExecutionInspector.test.tsx # M9.4 Live event stream UI & buffering tests
        ├── governanceExtractor.test.ts # M9.5 Policy decisions & budget state extraction tests
        ├── PolicyInspector.test.tsx    # M9.5 Policy authorization ledger UI tests
        ├── BudgetInspector.test.tsx    # M9.5 Resource budget utilization & limit alert tests
        ├── recoveryExtractor.test.ts   # M9.6 Forensic state & resumability assessment tests
        ├── RecoveryAssessmentBanner.test.tsx # M9.6 Safe vs blocked resume banner tests
        ├── FailureDiagnosticsCard.test.tsx   # M9.6 Severity filtering & operator action tests
        ├── RecoveryTimeline.test.tsx   # M9.6 Sequence ordering & timeline metadata tests
        ├── CheckpointForensicsCard.test.tsx # M9.6 Reconstructed position & ledger tests
        ├── RecoveryIntegration.test.tsx # M9.6 Full recovery forensics & resume integration tests
        ├── WorkspaceListPage.test.tsx  # M9.7.1 Workspace list & registration modal tests
        └── WorkspaceDetailFileBrowser.test.tsx # M9.7.1 Directory navigation & preview tests
```

---

## Route Map

| Path | View | Status / Milestone |
|---|---|---|
| `/` | Redirect to `/dashboard` | Active |
| `/dashboard` | Overview Dashboard | Milestone 9.2 (Active) |
| `/tasks` | Task Explorer | Milestone 9.3 (Active) |
| `/tasks/:taskId` | Task Detail & Forensics | Milestone 9.3 (Active) |
| `/live` | Live SSE Run Viewer | Milestone 9.4 Foundation |
| `/policies` | Security Policies Inspector | Milestone 9.4 Foundation |
| `/budgets` | Resource Budgets & Quotas | Milestone 9.4 Foundation |
| `/recovery` | Crash Recovery & State | Milestone 9.5 Foundation |
| `/workspaces` | Workspace Explorer | Milestone 9.7.1 (Active) |
| `/workspaces/:workspaceId` | Workspace Detail & Filesystem Explorer | Milestone 9.7.1 (Active) |
| `/evaluations` | Reliability Benchmark Suite | Milestone 9.6 Foundation |
| `/metrics` | Telemetry & Observability | Milestone 9.6 Foundation |
| `/settings` | Runtime API Settings | Milestone 9.1 (Active) |
| `*` | 404 Route Not Found | Active |

---

## M9.2 Runtime Overview Integration

Milestone 9.2 integrates the Overview dashboard directly with the live ForgeGuard M8 REST API, transforming it into an operational command center.

### 1. Truthful Runtime Status & Readiness
- Queries `GET /health` and `GET /health/ready` to evaluate live runtime health.
- Displays connection state, process health (`healthy`), engine status (`ready`), database availability (`available`), measured API round-trip latency (ms), and exact synchronization timestamp.
- Displays honest disconnected state (`DISCONNECTED`, `--` latency, `--` metrics) when the backend is unreachable, rather than fabricating mock data.
- Detects stale data: if background polling encounters network degradation while displaying cached data, an amber `Stale Data` badge and warning alert are presented.

### 2. Execution Metrics & Scope
- Aggregates canonical task statuses directly from `GET /api/v1/tasks`:
  - **Active Executions**: Count of tasks with status `running` or `created`.
  - **Completed Tasks**: Count of tasks with status `completed`.
  - **Failed Tasks**: Count of tasks with status `failed`.
  - **Cancelled Tasks**: Count of tasks with status `cancelled`.
- Each metric card explicitly states its scope (`Scoped to latest X tasks`) reflecting the actual backend query window.

### 3. Recent Executions Table
- Renders the latest tasks with monospaced IDs, prompt description tooltips, canonical status badges (with error indicators if `error_summary` is populated), workspace tags, duration, and creation timestamps.
- **Duration Calculation Logic**:
  - `finished_at - started_at`: Exact execution elapsed time for terminal tasks (`completed`, `failed`, `cancelled`).
  - `Date.now() - started_at`: Dynamic elapsed time for active `running` tasks.
  - `Pending`: Explicit representation for `created` tasks that have not yet started.
  - `--`: Shown when timestamps are omitted or unavailable.

### 4. Task-Derived Runtime Activity Feed
- Truthfully derives chronological lifecycle events from persisted task records without inventing synthetic events or requiring non-existent API endpoints.
- Derives `Task Submitted`, `Task Started`, and `Task Completed / Failed / Cancelled` events with exact relative timestamps and status badges.
- Clearly marked with an informative `Task-Derived` chip.

### 5. Polling Intervals & Cache Strategy
- Background polling via TanStack Query:
  - Runtime Health & Readiness: 15 seconds.
  - Task Execution List: 10 seconds.
- Preserves cached data (`placeholderData`) during background refetches to eliminate UI flicker.
- Header refresh button with animated spinner triggers immediate invalidation and refetch across all queries.

---

## Running the Dashboard

### Prerequisites

- Node.js `v20+` (tested on Node `v24.21.0`)
- npm `v10+` (tested on npm `11.19.0`)

### Installation

```bash
cd dashboard
npm install
```

### Development Server

```bash
npm run dev
```

Starts the local Vite development server at `http://localhost:5173`.

### Typechecking

```bash
npm run typecheck
```

Runs the TypeScript compiler (`tsc --noEmit`) across all source and test files.

### Testing

```bash
npm run test
```

Runs the complete Vitest test suite with React Testing Library (142 passing tests across 23 test files).

### Production Build

```bash
npm run build
```

Generates optimized, minified production assets in `dashboard/dist/`.

---

## M9.3 Task Explorer & Execution Detail

Milestone 9.3 transforms task management from placeholders into a rich execution browser and forensic inspection tool.

### 1. Task Explorer (`/tasks`)
- **Real Task Listing**: Directly connected to `GET /api/v1/tasks`.
- **Search**: Client-side filtering by Task ID or prompt on the current page, with explicit disclosure of scope.
- **Server-Side Status Filtering**: Filters by canonical statuses (`all`, `created`, `running`, `completed`, `failed`, `cancelled`), transmitting `status` directly to the backend.
- **Deterministic Pagination**: Controls `limit` (`10`, `20`, `50`) and `offset` with previous/next navigation and clear record ranges (`Showing tasks 1–20 (Page 1)`).
- **Execution Metadata & Duration**: Formats duration dynamically (`4.00s`, `1m 20s`, `Pending`, or `Xs (running)`).
- **Deep Linking**: Direct navigation to `/tasks/:taskId`.

### 2. Task Detail & Forensics (`/tasks/:taskId`)
- **Metadata Card**: Displays Task ID, status, workspace ID, iterations, tool call counts, timestamps, and duration.
- **Lifecycle Timeline**: Chronological progression from `Submitted` to `Execution Started` to terminal state (`Completed`, `Failed`, `Cancelled`).
- **Secure Input Inspection**: Renders task prompts in pre-wrapped monospace blocks strictly as text, preventing XSS and injection attacks.
- **Terminal Execution Outputs**: Queries `GET /api/v1/tasks/{taskId}/result` for terminal tasks; formats plain text `final_response` and structured JSON `outputs` in scrollable code blocks.
- **Errors & Diagnostics**: Renders error summaries and queries `GET /api/v1/tasks/{taskId}/diagnostics` to inspect trace IDs and recovery assessments (`can_resume_safely`).
- **Governed Task Actions**:
  - **Cancel Task**: Available on active tasks (`created`, `running`); requests confirmation before calling `POST /api/v1/tasks/{taskId}/cancel`.
  - **Resume Task**: Available on interrupted/failed recoverable tasks; requests confirmation before calling `POST /api/v1/tasks/{taskId}/resume`.
  - **Copy Actions**: Safe clipboard copying for Task ID, prompt, and output payload with visual feedback.

---

## M9.4 Live Execution Inspector & SSE Streaming

Milestone 9.4 integrates real-time Server-Sent Events (SSE) streaming and live execution forensics into the task detail view and execution explorer.

### 1. W3C-Compliant SSE Streaming Client (`fetch` + `ReadableStream`)
- **Custom Authentication Support**: Standard browser `EventSource` cannot send custom headers. ForgeGuard's `EventStreamClient` uses `fetch` with `ReadableStream` to inject `X-API-Key` headers securely.
- **Robust Reconnection**: Exponential backoff (1s initial, 1.5x multiplier, ±20% jitter, 15s max backoff, 8 retries max).
- **Graceful Polling Fallback**: Automatically falls back to standard interval polling if SSE is unsupported, blocked by proxies, or max retries are exceeded.
- **Deduplication & Sequence Gaps**: Tracks `seq` sequence numbers and `id` event identifiers. Reconnection passes `Last-Event-ID` header and `last_event_id` query param. Detects sequence gaps and renders visual alerts.

### 2. Live Execution Inspector Component (`LiveExecutionInspector`)
- **Unified Controls**:
  - Live Connection Status Badge: visual pulse indicator for `connected`, `connecting`, `reconnecting`, `paused`, `polling`, `closed`, and `error`.
  - Live / Paused Mode: Pausing freezes incoming event stream rendering into a static forensic snapshot, buffering incoming live events with a counter pill ("4 new events buffered"). Unpausing drains the buffer and resumes auto-scroll.
  - Auto-Scroll Toggle: Sticks to newest events when enabled; disengages automatically when the user scrolls back to inspect historical events.
  - Event Filtering: Real-time filtering by event category (lifecycle, tool calls, policy decisions, budgets, errors) and free-text search.
  - View Switcher: Toggle between granular chronological **Event Timeline** and correlated **Tool Calls** overview.

### 3. Granular Event & Tool Call Forensics
- **Event Timeline Rows (`EventTimelineItem`)**: Displays category-coded badges, sequence numbers, relative/wall timestamps, human-friendly summaries, and expandable formatted JSON payload viewer with single-click copy.
- **Correlated Tool Calls (`ToolCallVisualization`)**: Correlates `tool_call_started`, `policy_decision`, `tool_call_completed`, and `tool_call_rejected` into a unified interactive execution card displaying tool name, call ID, execution duration, parameters, output/error, and policy authorization rationale.
- **Data Protection & Sanitization**: Redacts sensitive environment variables, auth tokens, and credentials (`api_key`, `secret`, `token`, `password`, `authorization`) before rendering payloads.
- **Separation of Concerns**: Strict architectural separation between task execution state (`completed`, `failed`) and SSE stream connection state (`connected`, `closed`), ensuring terminal tasks display correct completion status with a clean closed stream.

---

## M9.5 Policy & Budget Inspector

Milestone 9.5 implements dedicated governance runtime observability inside the Task Detail console, providing truthful, evidence-backed inspection of policy authorizations and execution budget constraints.

### 1. Architectural Invariant & Zero Duplicate Connections
- **Invariant**: *LLM proposes; ForgeGuard authorizes and executes.*
- **Single Connection Architecture**: The parent `TaskDetailPage` mounts a single `useTaskEvents` instance and passes the resulting event stream and correlated tool calls directly to both `LiveExecutionInspector` and `GovernanceInspector`, eliminating redundant SSE connections and network overhead.
- **Truthful Data Extraction**: `extractPolicyDecisions` and `extractBudgetState` ingest real `policy_decision`, `budget_initialized`, `budget_updated`, and `budget_exceeded` SSE events along with fallback budget snapshots from `GET /api/v1/tasks/{taskId}/diagnostics`. No fake or hardcoded counters are rendered (`--` is displayed when data is absent).

### 2. Policy Authorization Ledger (`PolicyInspector`)
- **Authorization Badges**: Crisp visual distinction between `ALLOWED` (`#35C98A`) and `DENIED` (`#F16C78`) decisions.
- **Rule Metadata**: Renders matching policy rules (`explicit_allow`, `explicit_deny`, `default_allow`, `default_deny`).
- **Human Rationale**: Clearly surfaces why the policy engine authorized or rejected the proposed tool call.
- **Execution Correlation**: Automatically links authorization decisions to actual tool execution outcomes (`Executed: Success (0.55s)`, `Execution Blocked by Engine`, `Executed: Failed`, `Executed: Timed Out`).
- **Interactive Filtering & Search**: Instant filtering by decision type (`All`, `Allowed`, `Denied`) and free-text search across tool names and reasons.
- **Forensic Payload Viewer**: Expandable accordion displaying unmounted-on-exit formatted JSON payloads with single-click copy and automatic credential redaction.

### 3. Resource Budget Constraints & Utilization (`BudgetInspector`)
- **Primary Governance Metric Cards**:
  1. **Tool Calls Quota**: Tracked calls against `max_tool_calls` limit with reserved/available status indicators.
  2. **Execution Duration**: Measured wall-clock elapsed time against `max_execution_seconds` limit (formatted in `X.Xs` or `Xm Xs`).
  3. **Output Volume**: Measured cumulative byte generation against `max_output_bytes` limit (formatted in `B`, `KB`, or `MB`).
  4. **Failure Streak**: Monitored consecutive tool failures against `max_consecutive_failures` circuit breaker limit.
- **Visual Threshold Statuses**:
  - `normal` (< 70%): Clean graphite borders with subtle green progress bars.
  - `warning` (70% - 89%): Amber indicators alerting operators to resource consumption.
  - `critical` (90% - 99%): Coral rose borders and progress indicators warning of imminent quota exhaustion.
  - `exhausted` (100%+ or `budget_exceeded` event): High-visibility warning alert with `AlertOctagon` banner showing limit violation details.

---

## M9.6 Recovery & Diagnostics Inspector

Milestone 9.6 implements runtime resilience and failure recovery inspection inside the Task Detail console, providing truthful, evidence-backed diagnostics, deterministic execution replay, checkpoint state reconstruction, and safety-gated execution resumption.

### 1. Recovery Assessment & Resumption Invariants
- **High-Visibility Assessment Banner (`RecoveryAssessmentBanner`)**:
  - Dynamically evaluates task state, failure diagnostics, and `can_resume_safely` indicator.
  - States:
    - **Safe to Resume**: Emerald border with explicit rationale and one-click guarded `"Resume from Checkpoint"` button.
    - **Resume Blocked — Uncertain Side-Effects**: Coral rose alert warning that non-idempotent tool executions occurred without verified completion, preventing unsafe side-effect replay.
    - **Task is Actively Executing**: Visual pulse indicator for tasks currently running.
    - **Task Execution Complete**: Neutral informative banner for terminal completed tasks.
    - **Resume Blocked — Budget Exhausted**: Amber alert indicating resource budget exhaustion.
- **Strict Resumability Gating**:
  - Resumption is strictly gated: requires `can_resume_safely === true` AND task status is recoverable (`failed` or `interrupted`) AND task is not running AND runtime API is connected.
  - Automatically handles HTTP 409 (`FG-RECOVERY-409`) responses if backend detects uncertain state, surfacing non-disruptive error alerts.

### 2. Failure Diagnostics Ledger (`FailureDiagnosticsCard`)
- **Severity-Tiered Classification**:
  - Automatically maps raw error logs and exceptions to standardized severity levels (`critical`, `error`, `warning`, `info`).
  - Interactive severity filtering pills with count badges and free-text search across diagnostic messages and details.
- **Suggested Operator Action**:
  - Derives context-aware remediation suggestions (e.g. checking upstream API connectivity, reviewing tool authorization policies, or inspecting budget limits).
- **Tool Call Correlation & Credential Redaction**:
  - Links diagnostic records directly to associated tool execution IDs (`call_id`).
  - Recursively redacts sensitive authentication credentials, tokens, and secrets (`api_key`, `secret`, `password`, `token`, `authorization`) before rendering raw JSON details.

### 3. Chronological Recovery Timeline (`RecoveryTimeline`)
- **Deterministic Sequencing**:
  - Sorts events strictly by `sequence_number` to guarantee accurate forensic chronology.
  - Distinct event category chips: `lifecycle`, `tool_call`, `policy_decision`, `budget`, `checkpoint`, `error`.
  - Prominent visual indicators for critical milestones: `task_resumed`, `tool_timeout`, `budget_exceeded`, `task_failed`, `tool_call_rejected`.
- **Category Filtering & Monospaced Metadata**:
  - Instant filtering by event categories with search support and expandable JSON metadata drawers.

### 4. Checkpoint Forensics & State Reconstruction (`CheckpointForensicsCard`)
- **Truthful State Provenance**:
  - Reconstructs exact checkpoint position from persisted `recovery_info` and completed tool execution records.
  - Differentiates verified persistence sources:
    - `Verified SQLite Checkpoint`: State persisted in durable transactional storage with budget snapshot.
    - `Inferred from Tool Execution Records`: State reconstructed from verified tool outputs when durable snapshot is omitted.
    - `No Prior State Available`: Clean representation when task was interrupted before the initial checkpoint.
- **Preserved Tool Execution Ledger**:
  - Visual summary of preserved completed tool calls that will be skipped during replay.
  - Surfaces explicit warnings for uncertain tool calls that require operator review.

---

## M9.7.1 Workspace Explorer

Milestone 9.7.1 transforms the Workspace route into a functional, secure Workspace Explorer that integrates with ForgeGuard's runtime registry and directory isolation boundaries.

### 1. Workspace Registry & Safe Lifecycle
- **Workspace Explorer Landing (`/workspaces`)**:
  - Displays registered workspaces with ID, name, host filesystem root path, description, and creation timestamps.
  - One-click deep link to inspect the workspace directory sandbox.
- **Registration Modal (`RegisterWorkspaceDialog`)**:
  - Validates workspace display name and host filesystem path.
  - Enforces strict backend validation rejecting nonexistent paths, non-directories, and sensitive system root paths (`/`, `C:\`, `C:\Windows`, etc.).
  - Explicit disclosure: files remain locally on disk and are never uploaded or copied.
- **Safe Unregistration (`ConfirmationDialog`)**:
  - Guarded modal confirmation explicitly explaining that unregistering removes the record from ForgeGuard's registry without deleting any files from disk.

### 2. Filesystem Explorer (`FileBrowser`)
- **Breadcrumb Navigation**:
  - Interactive breadcrumb bar (`root / src / components`) supporting arbitrary subdirectory drilling and instant return navigation.
- **Directory Table**:
  - Displays icon-coded entries (folders, code files, text documents), filename, type/extension badges, and human-formatted sizes (`KB`, `MB`).
  - Strict path containment: navigation is strictly confined to the approved workspace root; path traversal attempts (`../`) are rejected with `403 Forbidden`.
  - Hidden dotfiles (`.git`, `.env`) are filtered out by default for safety.

### 3. Read-Only File Preview (`FilePreviewModal`)
- **Monospaced Preview**:
  - Clean monospaced viewing surface with whitespace preservation (`pre-wrap`) and horizontal scrolling for wide lines.
  - Metadata chips: file size, MIME type, and relative path.
- **Bounded Size & Truncation**:
  - Reads up to 50 KB by default with truncation badges (`Showing first 48.8 KB`) alerting operators when files exceed preview bounds.
- **Untrusted Plain Text Safety**:
  - Strict plain-text rendering (zero HTML, markdown, or JavaScript execution; no `dangerouslySetInnerHTML`).
- **Binary Content Protection**:
  - Detects binary file formats via extension and null-byte inspection; displays an informative callout rather than rendering corrupt binary streams.
- **Sensitive Credential Protection**:
  - Backend-enforced denial of secret-bearing files (`.env`, private keys, `credentials.json`, `.pem`, `.key`). Attempts to preview sensitive files return `403 Forbidden` and render a high-visibility security shield alert without leaking secret contents.

---

## M9.7.2 Evaluation Center & Historical Reports

Milestone 9.7.2 transforms the `/evaluations` route into a full-featured Evaluation Center and historical report explorer that interfaces with ForgeGuard's deterministic evaluation framework and persistent report store (`eval_reports/`).

### 1. Scenario Catalog Discovery
- **Scenario Catalog Browser (`/evaluations` - Tab 2)**:
  - Discovers all 20 deterministic scenarios registered across ForgeGuard's 5 evaluation suites:
    1. **Reliability & Invariants** (6 scenarios: happy path, tool failure handling, tool call budget exhaustion, output size exhaustion, consecutive failure limits, task cancellation).
    2. **Recovery & Durability** (3 scenarios: checkpoint resumption, uncertain mid-tool interception, idempotency conflict rejection).
    3. **Security & Sandboxing** (5 scenarios: default-deny allowlist enforcement, unknown tool rejection, prompt injection containment, workspace path traversal prevention, calculator AST injection blocking).
    4. **Agent Reasoning & Resilience** (5 scenarios: direct final answers without tools, multi-step deliberation, tool error recovery and adaptation, iteration limit enforcement, loop behavior pattern detection).
    5. **Performance Benchmarks** (1 scenario: runtime latency overhead profiling vs raw execution).
  - Search filter by scenario name, ID, description, or tag.
  - Severity badges (`critical`, `high`, `medium`) and category classifications.

### 2. Historical Evaluation Runs
- **Run Overview & Metrics**:
  - Top-level operational cards displaying total registered scenarios, total saved historical runs, latest run status (`PASS` / `FAIL`), and latest run timestamp.
- **Historical Reports Table (`/evaluations` - Tab 1)**:
  - Scans `eval_reports/` for recorded evaluation runs.
  - Columns: Experiment Run ID, Timestamp, Status Badge, Scenarios (Passed / Failed / Total), Pass Rate progress bar, Duration, and deep link to report details.
  - Search by experiment ID and filter by outcome status (`pass`, `fail`, `error`).

### 3. Detailed Report Inspection (`/evaluations/:experimentId`)
- **Executive Summary & Outcome**:
  - Overall status, pass rate percentage, assertion success metrics, and total execution duration.
- **Scenario Results Breakdown**:
  - Expandable scenario result items showing duration, assertion pass count, and tags.
  - **Failure Forensics Callout**: Highlighted expected vs actual values and diagnostic codes for failed assertions.
  - **Diagnostic Ledger**: Displays diagnostic codes (e.g. `FG-BUDGET-001`, `FG-POLICY-001`, `FG-LOOP-001`), messages, and actionable remediation advice.
- **Performance Benchmarks & Overhead Analysis**:
  - Detailed timing metrics table: Sample Count, Mean, Median, P95, Min, Max durations.
  - Quantified relative overhead percentage vs direct baseline execution (e.g., `+1171.01%` for policy authorization, `+39310.8%` for SQLite WAL durability & journaling).
- **Safe Artifact Inspection & Export**:
  - One-click safe download of raw JSON (`report_{id}.json`) and Markdown (`report_{id}.md`) report artifacts.
  - In-app modal viewer for instant markdown / JSON report inspection.
  - Path traversal and security protections ensuring artifact downloads remain strictly confined to the authorized `eval_reports` directory.

---

## M9.7.3 Interactive Evaluation Runner

Milestone 9.7.3 adds the interactive execution capabilities to the Evaluation Center, allowing operators to launch, monitor, stream, and evaluate deterministic scenario runs directly from the dashboard.

### 1. Launch Evaluation Run (`RunEvaluationDialog`)
- **Presets & Custom Configurations**:
  - **All Scenarios (20)**: Complete verification suite encompassing all 5 suites.
  - **Core Invariants (14)**: Fast verification of reliability, durability recovery, and security sandboxing invariants.
  - **Benchmarks Only (1)**: Precision runtime latency and overhead benchmarking.
  - **Custom Selection**: Interactive collapsible checkboxes per suite and per individual scenario.
- **Strict Sandbox Isolation Assurance**:
  - High-visibility assurance callout confirming that all scenarios execute inside ephemeral temporary directories with isolated SQLite databases that are cleaned up upon completion. User workspaces and production tasks are strictly untouched.
- **Concurrency Safeguard**:
  - Enforces a maximum of 1 active concurrent evaluation run. Disables launch and surfaces warnings when another run is in progress. Handles backend HTTP 409 Conflict gracefully (`FG-EVAL-409`).

### 2. Live Execution & Progress Tracking (`ActiveEvaluationBanner`)
- **Live Observability**:
  - Real-time status chips (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`), elapsed duration counter, and honest scenario progress percentage (`completed / total`).
  - Active scenario badge displaying the current scenario ID and name with a pulsating activity beacon.
  - Count of passed, failed, and error scenarios.
- **SSE Streaming & Auto-Refresh**:
  - Streams real-time execution events (`evaluation_started`, `scenario_started`, `scenario_completed`, `scenario_failed`, `evaluation_completed`, `stream_closed`) with keepalive comments.
  - Automatically invalidates TanStack Query caches (`queryKeys.evaluationReports`, `queryKeys.evaluationRuns`) when the run completes.
  - Provides instant direct navigation to the generated full report (`/evaluations/:experimentId`).

---

The developer console is designed to communicate with the ForgeGuard M8 runtime API:

- **Default Endpoint**: `http://127.0.0.1:8000`
- **Health Checks**:
  - `GET /health`: Basic health and version status
  - `GET /health/ready`: Database readiness and execution engine state
- **Task Management**:
  - `GET /api/v1/tasks`: Lists governed agent executions
  - `GET /api/v1/tasks/{task_id}`: Retrieves full execution detail
  - `GET /api/v1/tasks/{task_id}/result`: Retrieves final outcome and token accounting
- **Security & Persistence**:
  - The API Access Key corresponds to `FORGEGUARD_API_KEY` on the backend.
  - Credentials remain strictly in-memory by default. Opt-in browser local storage persistence is available in Settings with explicit security disclosures.
