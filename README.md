# ForgeGuard

**A reliability, security, and observability runtime for AI agents.**

ForgeGuard is designed to govern agent execution through permission enforcement,
resource budgets, durable state, failure recovery, and verifiable tool outcomes.

## Core capabilities

- Controlled tool execution
- Policy-based permissions
- Execution budgets
- Persistent task lifecycle
- Checkpointing and recovery
- Idempotency
- Execution event journal
- Agent observability
- Evaluation and fault injection

## Development

Python 3.10+

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
pytest
```

## Project status

Early development.
