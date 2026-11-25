# ForgeGuard Evaluation Report — exp_6bc1c671

**Tagline:** Control. Recover. Observe. Evaluate.

## 1. Executive Summary

- **Status:** ❌ FAIL
- **Experiment Name:** `forgeguard_evaluation`
- **Timestamp:** `2026-11-21T10:22:16.293627+00:00`
- **Total Duration:** `2343.00 ms`
- **Total Scenarios:** `20`
- **Passed:** `19`
- **Failed:** `1`
- **Errors:** `0`
- **Skipped:** `0`
- **Pass Rate:** `95.0%`

## 2. Environment Information

- **Platform:** `Windows-10-10.0.19045-SP0`
- **Python Version:** `3.10.0 (tags/v3.10.0:b494f59, Oct  4 2021, 19:00:18) [MSC v.1929 64 bit (AMD64)]`
- **Architecture:** `64bit`

## 3. Scenario Results Breakdown

| Scenario ID | Name | Category | Severity | Status | Duration (ms) | Assertions |
|---|---|---|---|---|---|---|
| `rel_01_success` | Reliability Happy Path Execution | `reliability` | `high` | **PASS** | 62.00 | 4/4 |
| `rel_02_tool_failure` | Reliability Tool Failure Handling | `reliability` | `high` | **PASS** | 63.00 | 2/2 |
| `rel_03_budget_call_exhaustion` | Tool Call Budget Limit Enforcement | `reliability` | `critical` | **PASS** | 109.00 | 3/3 |
| `rel_04_output_budget_exhaustion` | Output Byte Size Limit Enforcement | `reliability` | `critical` | **PASS** | 62.00 | 2/2 |
| `rel_05_consecutive_failures` | Consecutive Failure Limit Enforcement | `reliability` | `high` | **PASS** | 47.00 | 2/2 |
| `rel_06_cancellation` | Task Cancellation Clean Handling | `reliability` | `high` | **PASS** | 31.00 | 2/2 |
| `rec_01_checkpoint_resume` | Crash Recovery After Checkpoint | `recovery` | `critical` | **PASS** | 141.00 | 5/5 |
| `rec_02_uncertain_tool_blocked` | Uncertain Tool Execution Blocks Automatic Resume | `recovery` | `critical` | **FAIL** | 31.00 | 1/2 |
| `rec_03_idempotency_conflict` | Idempotency Conflict Rejection | `recovery` | `high` | **PASS** | 31.00 | 1/1 |
| `sec_01_unauthorized_tool` | Default-Deny Policy Enforcement | `security` | `critical` | **PASS** | 47.00 | 3/3 |
| `sec_02_unknown_tool` | Unregistered Tool Rejection | `security` | `high` | **PASS** | 31.00 | 2/2 |
| `sec_03_prompt_injection` | Prompt Injection Untrusted Data Containment | `security` | `critical` | **PASS** | 47.00 | 2/2 |
| `sec_04_workspace_path_traversal` | Workspace Path Traversal Protection | `security` | `critical` | **PASS** | 15.00 | 1/1 |
| `sec_05_calculator_code_injection` | Calculator AST Code Injection Prevention | `security` | `critical` | **PASS** | 32.00 | 1/1 |
| `agt_01_direct_answer` | Agent Concludes Without Tools | `agent` | `medium` | **PASS** | 46.00 | 2/2 |
| `agt_02_multi_step_reasoning` | Agent Multi-Step Tool Deliberation | `agent` | `high` | **PASS** | 63.00 | 2/2 |
| `agt_03_tool_error_recovery` | Agent Error Observation and Adaptation | `agent` | `high` | **PASS** | 78.00 | 2/2 |
| `agt_04_iteration_limit` | Agent Iteration Limit Enforcement | `agent` | `high` | **PASS** | 63.00 | 2/2 |
| `agt_05_loop_behavior_detection` | Behavioral Loop Pattern Detection | `loop` | `medium` | **PASS** | 78.00 | 1/1 |
| `bench_01_runtime_overhead` | ForgeGuard Runtime Overhead Benchmarks | `benchmark` | `medium` | **PASS** | 1218.00 | 3/3 |

## 4. Performance Benchmarks & Baseline Comparisons

| Benchmark ID | Workload | Mean (ms) | Median (ms) | P95 (ms) | Min (ms) | Max (ms) | Relative Overhead vs Baseline |
|---|---|---|---|---|---|---|---|
| `bm_baseline_direct` | Raw Tool Direct Execution | 0.5333 | 0.0000 | 0.0000 | 0.0000 | 16.0000 | **Baseline (0%)** |
| `bm_policy_only` | Policy Governance | 0.5333 | 0.0000 | 0.0000 | 0.0000 | 16.0000 | **+0.01%** |
| `bm_policy_budget` | Policy + Budget Enforcement | 1.0333 | 0.0000 | 15.0000 | 0.0000 | 16.0000 | **+93.76%** |
| `bm_durability` | Durability & Event Journal | 17.1667 | 16.0000 | 32.0000 | 0.0000 | 63.0000 | **+3118.95%** |
| `bm_full_runtime` | Full Governed Runtime | 19.3000 | 16.0000 | 47.0000 | 0.0000 | 47.0000 | **+3518.98%** |
| `bm_recovery_latency` | Crash Recovery Latency | 1.0333 | 0.0000 | 15.0000 | 0.0000 | 16.0000 | **Baseline (0%)** |

## 5. Failure Analysis & Diagnostics

### Scenario `rec_02_uncertain_tool_blocked`: Uncertain Tool Execution Blocks Automatic Resume
- **Reason:** `resume_safely_blocked: Expected True, got False`
- **Failed Assertions:**
  - `resume_safely_blocked`: expected `True`, got `False`: Expected True, got False
