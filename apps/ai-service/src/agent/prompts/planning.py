"""
Planning prompts for project initialization.
"""

def build_planning_prompt(project_id: str, prompt_text: str | None = None) -> str:
    user_instruction = f"\nUser Instruction: {prompt_text}" if prompt_text else ""
    return (
        f"Generate an initial Edit Plan for project_id: '{project_id}'.{user_instruction}\n\n"
        "Start by exploring the available footage using `get_shots`, `get_transcript`, and `get_tags`. "
        "Assemble a compelling timeline sequence, propose the plan, and validate it before finishing."
    )
