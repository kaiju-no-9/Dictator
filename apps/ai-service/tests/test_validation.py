"""
Unit tests for Python structural validator (src/validation/structural.py).
"""

import unittest
from src.validation.structural import validate_edit_plan


class TestStructuralValidator(unittest.TestCase):
    def test_valid_edit_plan(self):
        plan = {
            "version": "1.0.0",
            "project_id": "123e4567-e89b-12d3-a456-426614174000",
            "source_shots": [
                {"shot_id": "shot_0001", "start": 0.0, "end": 10.0},
            ],
            "timeline": [
                {"shot_id": "shot_0001", "trim_in": 1.0, "trim_out": 9.0, "transition_in": "hard_cut"},
            ],
        }

        result = validate_edit_plan(plan)
        self.assertTrue(result.valid)
        self.assertEqual(result.fatal_count, 0)

    def test_invalid_shot_id(self):
        plan = {
            "source_shots": [{"shot_id": "shot_0001", "start": 0.0, "end": 10.0}],
            "timeline": [{"shot_id": "shot_9999", "trim_in": 1.0, "trim_out": 9.0}],
        }

        result = validate_edit_plan(plan)
        self.assertFalse(result.valid)
        self.assertTrue(any(v.rule_id == "V-001" for v in result.violations))

    def test_trim_in_greater_than_trim_out(self):
        plan = {
            "source_shots": [{"shot_id": "shot_0001", "start": 0.0, "end": 10.0}],
            "timeline": [{"shot_id": "shot_0001", "trim_in": 5.0, "trim_out": 3.0}],
        }

        result = validate_edit_plan(plan)
        self.assertFalse(result.valid)
        self.assertTrue(any(v.rule_id == "V-004" for v in result.violations))


if __name__ == "__main__":
    unittest.main()
