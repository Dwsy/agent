# SkillCraft - LLM Agent Tool Composition Benchmark

## Description

Evaluate and analyze LLM agents' ability to form, abstract, and reuse higher-level tool compositions (Skills). Use this skill when researching agent skill discovery, tool composition patterns, or evaluating skill caching efficiency.

**触发词：** SkillCraft, skill discovery, tool composition, agent skills, skill caching, LLM benchmark, 技能发现, 工具组合

## Core Concepts

### Problem Statement
- Traditional benchmarks test "can the agent call the right tool?"
- SkillCraft tests "can the agent abstract and reuse tool combinations?"
- This is the difference between tool **usage** and tool **mastery**

### Dual Difficulty Dimensions

1. **Quantitative Scaling** - Increase number of entities/items to process
2. **Structural Scaling** - Compose subtasks into longer, more complex tool chains

### Key Findings

- **Up to 80% token reduction** through skill caching
- **Success rate correlates with tool composition ability**
- **Real-world stress test** - recurring patterns in long-horizon workflows

## Architecture Paradigm Shift

```
Traditional: Tool → LLM → Result

SkillCraft:  Tool → LLM → Skill Abstract → Skill Cache → Reuse
```

## Practical Applications

### Code Agent Skills
```
Pattern: read → analyze → edit → test → commit
Skill: One-click workflow execution
```

### Data Analysis Skills
```
Pattern: load → clean → analyze → visualize → report
Skill: Data type-specific analysis templates
```

### Research Skills
```
Pattern: search → filter → summarize → compare
Skill: Literature review automation
```

## Reproduction

### Prerequisites
- Linux (recommended)
- Python 3.10+
- `uv` package manager
- Node.js 22+ with `npx`
- OpenRouter/Toolathlon API endpoint

### Install & Run

```bash
# Clone
git clone https://github.com/shiqichen17/SkillCraft
cd SkillCraft

# Install
uv sync

# Configure .env
TOOLATHLON_OPENAI_API_KEY=YOUR_KEY
TOOLATHLON_OPENAI_BASE_URL=https://openrouter.ai/api/v1
TOOLATHLON_MODEL=deepseek-v3.2-exp
TOOLATHLON_PROVIDER=openrouter

# Run complete evaluation
uv run python test_all_tasks.py \
  --scaled-tasks \
  --mode base,skill \
  --model deepseek-v3.2-exp \
  --provider openrouter
```

### Single Task Test

```bash
# Base mode
bash run.sh scaled_tasks/cat-facts-collector/e1 base --model deepseek-v3.2-exp --provider openrouter

# Skill mode
bash run.sh scaled_tasks/cat-facts-collector/e1 skill --model deepseek-v3.2-exp --provider openrouter
```

## Benchmark Tasks

Scaled tasks include:
- `gitlab-deep-analysis`
- `countries-encyclopedia`
- `tvmaze-series-analyzer`
- `pokeapi-pokedex`
- `cat-facts-collector`
- And more...

## Output Structure

Each run produces:
```
test_runs/run_YYYYMMDD_HHMMSS/
├── run_info.json
├── test_results_<provider>_<model>.json
├── summary_<provider>_<model>.json
├── dumps_base_test/
└── dumps_skill_test/
```

## Cognitive Level Mapping

| Level | Type | SkillCraft Test |
|-------|------|-----------------|
| 1 | Knowledge | ❌ Not tested |
| 2 | Understanding | ❌ Not tested |
| 3 | Application | ⚠️ Prerequisite |
| 4 | Analysis | ⚠️ Prerequisite |
| 5 | **Synthesis** | ✅ **Core test** |
| 6 | Evaluation | ⚠️ Implicit |

**Core test:** Can the agent synthesize new skills from tool combinations?

## Implications for Agent Development

### Current Agent Skills Limitations
- Depend on human pre-definition (SKILL.md)
- Cannot auto-discover skill patterns
- Lack cross-task reuse mechanism

### Future Evolution

```yaml
skill:
  type: human-defined      # Current: human-written
  type: auto-discovered    # Future: pattern mining from trajectories
  
  source:
    - pattern_mining       # Discover from success trajectories
    - composition          # Abstract tool combinations
    - optimization         # Auto-optimize existing skills
    
  metrics:
    - token_savings        # Efficiency gain
    - success_rate         # Task completion
    - transferability      # Cross-domain applicability
```

### Actionable Insights for pi Skills

1. **Trajectory Analysis** - Mine pi logs for high-frequency tool combinations
2. **Skill Extraction** - Auto-generate SKILL.md candidates
3. **Effect Validation** - Use SkillCraft methodology for quality assessment

## Resources

- **Paper:** [SkillCraft: Can LLM Agents Learn to Use Tools Skillfully?](https://arxiv.org/abs/2603.00718)
- **Code:** [github.com/shiqichen17/SkillCraft](https://github.com/shiqichen17/SkillCraft)
- **Project:** [skillcraft-website.github.io/page](https://skillcraft-website.github.io/page/)

## Citation

```bibtex
@misc{chen2026skillcraftllmagentslearn,
      title={SkillCraft: Can LLM Agents Learn to Use Tools Skillfully?},
      author={Shiqi Chen and Jingze Gai and Ruochen Zhou and Jinghan Zhang and Tongyao Zhu and Junlong Li and Kangrui Wang and Zihan Wang and Zhengyu Chen and Klara Kaleb and Ning Miao and Siyang Gao and Cong Lu and Manling Li and Junxian He and Yee Whye Teh},
      year={2026},
      eprint={2603.00718},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2603.00718},
}
```

## Key Insight

> SkillCraft tests whether agents can evolve from "tool users" to "skill creators" - a qualitative leap from execution to learning.

---

*Last updated: 2026-03-21*
