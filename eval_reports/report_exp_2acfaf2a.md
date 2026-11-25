# ForgeGuard Evaluation Report — exp_2acfaf2a

**Tagline:** Control. Recover. Observe. Evaluate.

## 1. Executive Summary

- **Status:** ✅ PASS
- **Experiment Name:** `forgeguard_evaluation`
- **Timestamp:** `2026-11-21T10:44:46.146084+00:00`
- **Total Duration:** `2985.00 ms`
- **Total Scenarios:** `20`
- **Passed:** `20`
- **Failed:** `0`
- **Errors:** `0`
- **Skipped:** `0`
- **Pass Rate:** `100.0%`

## 2. Environment Information

- **Platform:** `Windows-10-10.0.19045-SP0`
- **Python Version:** `3.10.0 (tags/v3.10.0:b494f59, Oct  4 2021, 19:00:18) [MSC v.1929 64 bit (AMD64)]`
- **Architecture:** `64bit`

## 3. Scenario Results Breakdown

| Scenario ID | Name | Category | Severity | Status | Duration (ms) | Assertions |
|---|---|---|---|---|---|---|
| `rel_01_success` | Reliability Happy Path Execution | `reliability` | `high` | **PASS** | 63.00 | 4/4 |
| `rel_02_tool_failure` | Reliability Tool Failure Handling | `reliability` | `high` | **PASS** | 62.00 | 2/2 |
| `rel_03_budget_call_exhaustion` | Tool Call Budget Limit Enforcement | `reliability` | `critical` | **PASS** | 63.00 | 3/3 |
| `rel_04_output_budget_exhaustion` | Output Byte Size Limit Enforcement | `reliability` | `critical` | **PASS** | 46.00 | 2/2 |
| `rel_05_consecutive_failures` | Consecutive Failure Limit Enforcement | `reliability` | `high` | **PASS** | 47.00 | 2/2 |
| `rel_06_cancellation` | Task Cancellation Clean Handling | `reliability` | `high` | **PASS** | 47.00 | 2/2 |
| `rec_01_checkpoint_resume` | Crash Recovery After Checkpoint | `recovery` | `critical` | **PASS** | 78.00 | 5/5 |
| `rec_02_uncertain_tool_blocked` | Uncertain Tool Execution Blocks Automatic Resume | `recovery` | `critical` | **PASS** | 47.00 | 2/2 |
| `rec_03_idempotency_conflict` | Idempotency Conflict Rejection | `recovery` | `high` | **PASS** | 47.00 | 1/1 |
| `sec_01_unauthorized_tool` | Default-Deny Policy Enforcement | `security` | `critical` | **PASS** | 47.00 | 3/3 |
| `sec_02_unknown_tool` | Unregistered Tool Rejection | `security` | `high` | **PASS** | 46.00 | 2/2 |
| `sec_03_prompt_injection` | Prompt Injection Untrusted Data Containment | `security` | `critical` | **PASS** | 188.00 | 2/2 |
| `sec_04_workspace_path_traversal` | Workspace Path Traversal Protection | `security` | `critical` | **PASS** | 47.00 | 1/1 |
| `sec_05_calculator_code_injection` | Calculator AST Code Injection Prevention | `security` | `critical` | **PASS** | 62.00 | 1/1 |
| `agt_01_direct_answer` | Agent Concludes Without Tools | `agent` | `medium` | **PASS** | 78.00 | 2/2 |
| `agt_02_multi_step_reasoning` | Agent Multi-Step Tool Deliberation | `agent` | `high` | **PASS** | 156.00 | 2/2 |
| `agt_03_tool_error_recovery` | Agent Error Observation and Adaptation | `agent` | `high` | **PASS** | 94.00 | 2/2 |
| `agt_04_iteration_limit` | Agent Iteration Limit Enforcement | `agent` | `high` | **PASS** | 94.00 | 2/2 |
| `agt_05_loop_behavior_detection` | Behavioral Loop Pattern Detection | `loop` | `medium` | **PASS** | 125.00 | 1/1 |
| `bench_01_runtime_overhead` | ForgeGuard Runtime Overhead Benchmarks | `benchmark` | `medium` | **PASS** | 1500.00 | 3/3 |

## 4. Performance Benchmarks & Baseline Comparisons

| Benchmark ID | Workload | Mean (ms) | Median (ms) | P95 (ms) | Min (ms) | Max (ms) | Relative Overhead vs Baseline |
|---|---|---|---|---|---|---|---|
| `bm_baseline_direct` | Raw Tool Direct Execution | 0.0662 | 0.0494 | 0.1767 | 0.0166 | 0.4114 | **Baseline (0%)** |
| `bm_policy_only` | Policy Governance | 0.8414 | 0.6631 | 1.6133 | 0.5899 | 2.4209 | **+1171.01%** |
| `bm_policy_budget` | Policy + Budget Enforcement | 1.0103 | 0.9729 | 1.7054 | 0.5910 | 1.8255 | **+1426.14%** |
| `bm_durability` | Durability & Event Journal | 26.0899 | 22.1938 | 56.2540 | 15.6075 | 63.3390 | **+39310.8%** |
| `bm_full_runtime` | Full Governed Runtime | 19.3519 | 16.9221 | 37.3229 | 13.7267 | 47.0304 | **+29132.46%** |
| `bm_recovery_latency` | Crash Recovery Latency | 1.6886 | 1.4223 | 3.5791 | 1.1372 | 3.6793 | **Baseline (0%)** |