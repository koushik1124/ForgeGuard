# ForgeGuard Evaluation Report — exp_82f5de57

**Tagline:** Control. Recover. Observe. Evaluate.

## 1. Executive Summary

- **Status:** ✅ PASS
- **Experiment Name:** `forgeguard_evaluation`
- **Timestamp:** `2026-11-24T10:07:45.133859+00:00`
- **Total Duration:** `4390.00 ms`
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
| `rel_01_success` | Reliability Happy Path Execution | `reliability` | `high` | **PASS** | 125.00 | 4/4 |
| `rel_02_tool_failure` | Reliability Tool Failure Handling | `reliability` | `high` | **PASS** | 156.00 | 2/2 |
| `rel_03_budget_call_exhaustion` | Tool Call Budget Limit Enforcement | `reliability` | `critical` | **PASS** | 62.00 | 3/3 |
| `rel_04_output_budget_exhaustion` | Output Byte Size Limit Enforcement | `reliability` | `critical` | **PASS** | 63.00 | 2/2 |
| `rel_05_consecutive_failures` | Consecutive Failure Limit Enforcement | `reliability` | `high` | **PASS** | 78.00 | 2/2 |
| `rel_06_cancellation` | Task Cancellation Clean Handling | `reliability` | `high` | **PASS** | 47.00 | 2/2 |
| `rec_01_checkpoint_resume` | Crash Recovery After Checkpoint | `recovery` | `critical` | **PASS** | 141.00 | 5/5 |
| `rec_02_uncertain_tool_blocked` | Uncertain Tool Execution Blocks Automatic Resume | `recovery` | `critical` | **PASS** | 125.00 | 2/2 |
| `rec_03_idempotency_conflict` | Idempotency Conflict Rejection | `recovery` | `high` | **PASS** | 140.00 | 1/1 |
| `sec_01_unauthorized_tool` | Default-Deny Policy Enforcement | `security` | `critical` | **PASS** | 125.00 | 3/3 |
| `sec_02_unknown_tool` | Unregistered Tool Rejection | `security` | `high` | **PASS** | 94.00 | 2/2 |
| `sec_03_prompt_injection` | Prompt Injection Untrusted Data Containment | `security` | `critical` | **PASS** | 562.00 | 2/2 |
| `sec_04_workspace_path_traversal` | Workspace Path Traversal Protection | `security` | `critical` | **PASS** | 78.00 | 1/1 |
| `sec_05_calculator_code_injection` | Calculator AST Code Injection Prevention | `security` | `critical` | **PASS** | 63.00 | 1/1 |
| `agt_01_direct_answer` | Agent Concludes Without Tools | `agent` | `medium` | **PASS** | 93.00 | 2/2 |
| `agt_02_multi_step_reasoning` | Agent Multi-Step Tool Deliberation | `agent` | `high` | **PASS** | 141.00 | 2/2 |
| `agt_03_tool_error_recovery` | Agent Error Observation and Adaptation | `agent` | `high` | **PASS** | 141.00 | 2/2 |
| `agt_04_iteration_limit` | Agent Iteration Limit Enforcement | `agent` | `high` | **PASS** | 125.00 | 2/2 |
| `agt_05_loop_behavior_detection` | Behavioral Loop Pattern Detection | `loop` | `medium` | **PASS** | 125.00 | 1/1 |
| `bench_01_runtime_overhead` | ForgeGuard Runtime Overhead Benchmarks | `benchmark` | `medium` | **PASS** | 1843.00 | 3/3 |

## 4. Performance Benchmarks & Baseline Comparisons

| Benchmark ID | Workload | Mean (ms) | Median (ms) | P95 (ms) | Min (ms) | Max (ms) | Relative Overhead vs Baseline |
|---|---|---|---|---|---|---|---|
| `bm_baseline_direct` | Raw Tool Direct Execution | 0.0337 | 0.0353 | 0.0396 | 0.0204 | 0.0427 | **Baseline (0%)** |
| `bm_policy_only` | Policy Governance | 1.0373 | 0.8886 | 1.8001 | 0.7671 | 2.0798 | **+2977.92%** |
| `bm_policy_budget` | Policy + Budget Enforcement | 0.9024 | 0.8020 | 1.6851 | 0.7438 | 1.7389 | **+2577.73%** |
| `bm_durability` | Durability & Event Journal | 27.1638 | 20.5072 | 92.0366 | 18.4616 | 129.7522 | **+80504.64%** |
| `bm_full_runtime` | Full Governed Runtime | 27.1684 | 19.4271 | 105.1499 | 18.1079 | 122.0027 | **+80518.3%** |
| `bm_recovery_latency` | Crash Recovery Latency | 2.0134 | 1.7470 | 3.5007 | 1.5190 | 4.4943 | **Baseline (0%)** |