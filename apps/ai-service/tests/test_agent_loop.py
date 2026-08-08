"""
Pytest unit tests for Agent Loop tool dispatch and parsing (src/agent/loop.py).
"""

from src.agent.loop import AgentLoop


def test_agent_loop_tool_dispatch():
    shots_ctx = [{"shot_id": "shot_0001", "start": 0.0, "end": 10.0}]
    tx_ctx = [{"shot_id": "shot_0001", "text": "Hello world"}]
    tags_ctx = {"shot_0001": ["interview"]}

    loop = AgentLoop(
        project_id="test_proj",
        shots_context=shots_ctx,
        transcript_context=tx_ctx,
        tags_context=tags_ctx,
    )

    shots_res = loop._dispatch_tool("get_shots", {})
    assert len(shots_res) == 1
    assert shots_res[0]["shot_id"] == "shot_0001"

    search_res = loop._dispatch_tool("search_shots", {"query": "interview"})
    assert len(search_res) == 1
    assert search_res[0]["shot_id"] == "shot_0001"

    val_res = loop._dispatch_tool(
        "validate_plan",
        {
            "plan_json": {
                "source_shots": shots_ctx,
                "timeline": [{"shot_id": "shot_0001", "trim_in": 1.0, "trim_out": 9.0}],
            }
        },
    )
    assert val_res["valid"] is True


def test_extract_json_plan_fallback():
    loop = AgentLoop("test", [], [], {})

    text_with_json = """Here is the proposed plan:
```json
{
  "source_shots": [{"shot_id": "shot_0001"}],
  "timeline": [{"shot_id": "shot_0001", "trim_in": 0, "trim_out": 5}]
}
```"""

    extracted = loop._extract_json_plan(text_with_json)
    assert extracted is not None
    assert "timeline" in extracted
    assert extracted["timeline"][0]["shot_id"] == "shot_0001"
