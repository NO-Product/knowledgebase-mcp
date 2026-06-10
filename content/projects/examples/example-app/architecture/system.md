---
title: System Architecture
summary: Example App uses a static MCP knowledgebase and optional provider-backed artifacts.
---

# System Architecture

Example App stores authored project memory as Markdown. Build-time search indexes the Markdown into MiniSearch JSON files. Optional provider integrations can attach external stores without turning the MCP into a generic provider proxy.

## Boundaries

This surface should expose project context only. Separate reference documentation should live in a separate surface.
