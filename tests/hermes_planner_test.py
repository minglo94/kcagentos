import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("hermes_planner", Path(__file__).parents[1] / "scripts/hermes_planner.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def sample():
    return {"summary": "Prepare draft", "steps": [{"id": "s1", "title": "Review", "agent": "clerk", "executor": "manual", "dependsOn": [], "instructions": "Review provided data"}], "acceptance": ["Teacher reviews draft"]}


class MockAgent:
    def __init__(self, enabled_toolsets=None, skip_memory=False, skip_context_files=False,
                 load_soul_identity=True, session_db=None, save_trajectories=True,
                 max_iterations=90, **kwargs):
        assert enabled_toolsets == [] and skip_memory and skip_context_files
        assert not load_soul_identity and session_db is None and not save_trajectories
        assert max_iterations == 1 and kwargs["fallback_model"] is None
        self.tools = []
        self.valid_tool_names = set()
        self.enabled_toolsets = enabled_toolsets

    def _execute_tool_calls(self, *args):
        raise AssertionError("unprotected")

    _execute_tool_calls_sequential = _execute_tool_calls
    _execute_tool_calls_concurrent = _execute_tool_calls

    def run_conversation(self, message, system_message=None):
        return {"final_response": json.dumps(sample())}


class PlannerTests(unittest.TestCase):
    def test_no_tools_and_valid_response(self):
        agent = bridge.create_agent(MockAgent, {"default": "local", "base_url": "http://127.0.0.1:11434/v1"})
        self.assertEqual(bridge.generate(agent, {"goal": "Prepare attendance draft", "team": "school"}), sample())
        with self.assertRaisesRegex(bridge.BridgeError, "tool_execution_forbidden"):
            agent._execute_tool_calls([])

    def test_tools_fail_closed(self):
        class BadAgent(MockAgent):
            def __init__(self, enabled_toolsets=None, skip_memory=False, skip_context_files=False,
                         load_soul_identity=True, session_db=None, save_trajectories=True,
                         max_iterations=90, **kwargs):
                super().__init__(enabled_toolsets, skip_memory, skip_context_files, load_soul_identity, session_db, save_trajectories, max_iterations, **kwargs)
                self.tools = ["terminal"]
        with self.assertRaisesRegex(bridge.BridgeError, "hermes_tools_not_disabled"):
            bridge.create_agent(BadAgent, {"default": "local", "base_url": "http://localhost/v1"})

    def test_plan_validation(self):
        for change in ("extra", "executor", "cycle", "agent"):
            plan = sample()
            if change == "extra": plan["commands"] = ["anything"]
            if change == "executor": plan["steps"][0]["executor"] = "shell"
            if change == "cycle": plan["steps"][0]["dependsOn"] = ["s1"]
            if change == "agent": plan["steps"][0]["agent"] = "archie"
            with self.subTest(change=change), self.assertRaises(bridge.BridgeError):
                bridge.validate_plan(plan, "school")

    def test_readonly_executor_scope(self):
        plan = sample()
        plan["steps"][0].update(agent="archie", executor="codex.readonly")
        bridge.validate_plan(plan, "development")
        plan["steps"][0]["agent"] = "bob"
        with self.assertRaises(bridge.BridgeError):
            bridge.validate_plan(plan, "development")

    def test_profile_config(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / "agentos-planner"
            home.mkdir()
            config = home / "config.yaml"
            config.write_text("model:\n  provider: custom\n  default: local\n  base_url: http://127.0.0.1:11434/v1\n", encoding="utf-8")
            with patch.dict(bridge.os.environ, {"HERMES_HOME": str(home)}):
                self.assertEqual(bridge.isolated_config()["provider"], "custom")
                (home / "auth.json").write_text("{}")
                with self.assertRaisesRegex(bridge.BridgeError, "profile_not_isolated"):
                    bridge.isolated_config()
                (home / "auth.json").unlink()
                config.write_text("model:\n  provider: custom\n  default: local\n  base_url: https://example.org/v1\n", encoding="utf-8")
                with self.assertRaisesRegex(bridge.BridgeError, "loopback_model_required"):
                    bridge.isolated_config()

    def test_invalid_model_json(self):
        agent = MockAgent(enabled_toolsets=[], skip_memory=True, skip_context_files=True,
                          load_soul_identity=False, save_trajectories=False, max_iterations=1, fallback_model=None)
        agent.run_conversation = lambda *a, **k: {"final_response": "```json\n{}\n```"}
        with self.assertRaisesRegex(bridge.BridgeError, "invalid_model_json"):
            bridge.generate(agent, {"goal": "draft", "team": "school"})


if __name__ == "__main__":
    unittest.main()
