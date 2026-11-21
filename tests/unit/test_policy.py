
from forgeguard.policies.policy import Policy, PolicyEngine


def test_explicitly_allowed_tool() -> None:
    engine = PolicyEngine(
        Policy(allowed_tools=frozenset({"read_file"}))
    )

    decision = engine.evaluate("read_file")

    assert decision.allowed is True
    assert decision.matched_rule == "explicit_allow"


def test_explicitly_denied_tool() -> None:
    engine = PolicyEngine(
        Policy(denied_tools=frozenset({"delete_file"}))
    )

    decision = engine.evaluate("delete_file")

    assert decision.allowed is False
    assert decision.matched_rule == "explicit_deny"


def test_default_deny_blocks_unknown_tool() -> None:
    engine = PolicyEngine()

    decision = engine.evaluate("unknown_tool")

    assert decision.allowed is False
    assert decision.matched_rule == "default_deny"


def test_deny_overrides_allow() -> None:
    engine = PolicyEngine(
        Policy(
            allowed_tools=frozenset({"delete_file"}),
            denied_tools=frozenset({"delete_file"}),
        )
    )

    decision = engine.evaluate("delete_file")

    assert decision.allowed is False
    assert decision.matched_rule == "explicit_deny"


def test_default_allow_policy() -> None:
    engine = PolicyEngine(Policy(default_allow=True))

    decision = engine.evaluate("some_tool")

    assert decision.allowed is True
    assert decision.matched_rule == "default_allow"


def test_explicit_allow_overrides_default_deny() -> None:
    engine = PolicyEngine(
        Policy(
            allowed_tools=frozenset({"search"}),
            default_allow=False,
        )
    )

    decision = engine.evaluate("search")

    assert decision.allowed is True


def test_policy_decision_contains_metadata() -> None:
    engine = PolicyEngine(
        Policy(allowed_tools=frozenset({"search"}))
    )

    decision = engine.evaluate(
        "search",
        metadata={"task_id": "task-123", "step": 1},
    )

    assert decision.metadata["task_id"] == "task-123"
    assert decision.metadata["step"] == 1


def test_policy_decision_contains_timestamp() -> None:
    engine = PolicyEngine(
        Policy(allowed_tools=frozenset({"search"}))
    )

    decision = engine.evaluate("search")

    assert decision.timestamp.tzinfo is not None


def test_empty_allowed_tool_name_rejected() -> None:
    try:
        Policy(allowed_tools=frozenset({" "}))
    except ValueError as exc:
        assert "Allowed tool names cannot be empty" in str(exc)
    else:
        raise AssertionError("Expected ValueError")


def test_empty_denied_tool_name_rejected() -> None:
    try:
        Policy(denied_tools=frozenset({" "}))
    except ValueError as exc:
        assert "Denied tool names cannot be empty" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
