<div align="center">

# 🧠 pi-hippocampus

**Give your AI a brain, literally.**

[![Pi Agent Extension](https://img.shields.io/badge/Pi%20Agent-Extension-blueviolet)](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
[![Version](https://img.shields.io/badge/version-4.2.2-blue)](https://github.com/lebonbruce/pi-hippocampus/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**English**](README.md) | [**简体中文**](README_ZH.md)

</div>

---

Let's be real: AI coding agents are amazing, but they have the memory of a goldfish.

Every time I close a session or switch projects, it forgets my coding style, my API keys, and that annoying bug I fixed yesterday. I got tired of repeating myself.

So I built **pi-hippocampus**. 
It's not just a database; it's a **biological memory implant** for **[pi-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)**.

---

## ✨ Why this is actually good

### 1. It's Invisible (Zero Friction)
You don't need to learn new commands.
Just chat naturally. The extension listens in the background. When you say something important (like "Always use Python 3.10"), it catches it, encodes it, and saves it.
It just works.

### 2. It Dreams (Consolidation) 💤
This is the killer feature.
Just like humans sleep to organize memories, this plugin runs a **Consolidation Process** in the background.
- It scans your recent fragmented conversations.
- It summarizes them into solid Rules.
- **Best part:** It does this locally using logic and vector math. **It costs ZERO LLM tokens.** Your database gets smarter and cleaner for free.

### 3. Cross-Project Intuition
Most agents keep memory siloed per project.
But if I fixed a specific `CORS` error in Project A, I want that knowledge when I hit the same error in Project B.
Hippocampus uses **"Permeable Recall"**. If a memory is important enough, it pierces through the project boundary. It feels like your agent actually has intuition.

---

## ⚡️ Install

**Choose your OS below.**

### 🍎 Mac / Linux (Bash/Zsh)
```bash
mkdir -p ~/.pi/agent/extensions && cd ~/.pi/agent/extensions && rm -rf pi-hippocampus && git clone https://github.com/lebonbruce/pi-hippocampus.git pi-hippocampus && cd pi-hippocampus && npm install && echo "✅ Done! Restart your agent."
```

### 🪟 Windows (PowerShell)
> **Note**: Open "Windows PowerShell" to run this.

```powershell
$p="$env:USERPROFILE\.pi\agent\extensions"; New-Item -ItemType Directory -Force -Path $p; cd $p; Remove-Item pi-hippocampus -Recurse -Force -ErrorAction SilentlyContinue; git clone https://github.com/lebonbruce/pi-hippocampus.git pi-hippocampus; cd pi-hippocampus; npm install; Write-Host "✅ Done! Restart your agent."
```

### 🪟 Windows (Command Prompt / cmd.exe)
> **Note**: If you see `C:\Users\Name>`, use this.

```cmd
cd /d "%USERPROFILE%" && if not exist ".pi\agent\extensions" mkdir ".pi\agent\extensions" && cd ".pi\agent\extensions" && if exist "pi-hippocampus" rmdir /s /q pi-hippocampus && git clone https://github.com/lebonbruce/pi-hippocampus.git pi-hippocampus && cd pi-hippocampus && npm install && echo "✅ Done! Restart your agent."
```

---

## 🧩 How it works (No Math, just Logic)

I won't bore you with complex formulas. Here is the gist:

Your memories live in a high-dimensional vector space (`~/.pi-hippocampus/`).

1.  **Bio-Mimetic Tags**: Every memory is tagged as a **Fact**, **Rule**, or **Event**. Rules are sticky; Events fade away over time (unless you recall them often).
2.  **Survival of the Fittest**: Memories compete for attention.
    - Important stuff (High weights) stays.
    - Trivial chatter follows the **Ebbinghaus Forgetting Curve** and disappears.
3.  **Synaptic Links**: If you mention "Login" and "Database" together often, the system physically links these memories. Recalling one pulls up the other.

---

## 🤝 Wrap up

I'm just an indie dev sharing a tool that solved a huge pain for me.
It's local, private, and free.

If you find a bug or have an idea, drop it in the Issues.

> **GitHub Issues**: [Click here](https://github.com/lebonbruce/pi-hippocampus/issues)

---

<div align="center">
  <sub>Built with ❤️ by a dev for devs.</sub>
</div>
