import { mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalog, root, validateCatalog } from "./catalog-lib.mjs";

const catalog = validateCatalog(await loadCatalog());
const generatedRoot = path.join(root, "generated");

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${value.trim()}\n`);
}

function skillMarkdown(agent, skill) {
  return `---
name: ${agent.id}-${skill.id}
description: ${skill.description}
---

# ${skill.name}

${skill.trigger}

## Inputs

${skill.inputs.map((item) => `- ${item}`).join("\n")}

## Workflow

${skill.workflow.map((item, index) => `${index + 1}. ${item}.`).join("\n")}

## Output

${skill.outputs.map((item) => `- ${item}`).join("\n")}

## Boundaries

${skill.boundaries.map((item) => `- ${item}.`).join("\n")}

Explicit user instructions take priority over this workflow. Ask for missing decision-critical input. Do not invent evidence, tool results, permissions, or completed actions.`;
}

function claudeAgentMarkdown(agent) {
  return `---
name: ${agent.id}
description: ${agent.shortDescription}
tools: Read, Grep, Glob
---

# ${agent.name}

${agent.roleCharter}

Choose the smallest relevant bundled skill for the request. State material assumptions, respect every skill boundary, and keep the user in control of consequential decisions.

## Does not do

${agent.nonGoals.map((item) => `- ${item}`).join("\n")}`;
}

function readme(agent) {
  return `# ${agent.name}

${agent.shortDescription}

Version ${agent.version}. Licensed under MIT.

## Included skills

${agent.skills.map((skill) => `- **${skill.name}:** ${skill.description}`).join("\n")}

## Boundaries

${agent.nonGoals.map((item) => `- ${item}`).join("\n")}

This package contains instructions and metadata only. It does not bundle executable hooks, scripts, credentials, or hidden MCP servers.`;
}

await rm(generatedRoot, { recursive: true, force: true });

const flattenedSkills = catalog.agents.flatMap((agent) =>
  agent.skills.map((skill) => ({
    ...skill,
    slug: `${agent.id}-${skill.id}`,
    agentId: agent.id,
    agentName: agent.name,
    departmentIds: agent.departmentIds,
  })),
);
const publicCatalog = { ...catalog, skills: flattenedSkills };
await writeJson(path.join(root, "src/generated/catalog.json"), publicCatalog);
await writeJson(path.join(root, "public/catalog.json"), publicCatalog);

const codexMarketplace = {
  name: "ai-office",
  description: "First-party professional agents for Codex",
  owner: { name: "AI Office contributors" },
  plugins: catalog.agents.map((agent) => ({
    name: agent.id,
    source: `./plugins/${agent.id}`,
    description: agent.shortDescription,
    version: agent.version,
  })),
};
await writeJson(path.join(generatedRoot, "codex-marketplace/.agents/plugins/marketplace.json"), codexMarketplace);

const claudeMarketplace = {
  name: "ai-office",
  description: "First-party professional agents for Claude Code",
  owner: { name: "AI Office contributors" },
  plugins: catalog.agents.map((agent) => ({
    name: agent.id,
    source: `./plugins/${agent.id}`,
    description: agent.shortDescription,
    version: agent.version,
  })),
};
await writeJson(path.join(generatedRoot, "claude-marketplace/.claude-plugin/marketplace.json"), claudeMarketplace);

for (const agent of catalog.agents) {
  const codexRoot = path.join(generatedRoot, "codex-marketplace/plugins", agent.id);
  const claudeRoot = path.join(generatedRoot, "claude-marketplace/plugins", agent.id);
  const connectorNames = agent.connectorIds.map((id) => catalog.connectors.find((item) => item.id === id)?.name).filter(Boolean);

  await writeJson(path.join(codexRoot, "plugin.json"), {
    name: agent.id,
    version: agent.version,
    description: agent.shortDescription,
    license: agent.license,
    skills: "./skills",
    interface: {
      displayName: agent.name,
      shortDescription: agent.shortDescription,
      category: "Productivity",
      capabilities: agent.outcomes,
      defaultPrompt: agent.examples.map((item) => item.prompt),
      brandColor: "#2E8B63",
    },
  });
  const openAiDependencies = connectorNames.length
    ? `\ndependencies:\n  notes:\n${connectorNames.map((name) => `    - "Optional: connect ${name} only when a workflow requires it."`).join("\n")}`
    : "";
  await writeText(path.join(codexRoot, "agents/openai.yaml"), `interface:\n  display_name: "${agent.name}"\n  short_description: "${agent.shortDescription}"\n  brand_color: "#2E8B63"\n  default_prompt: "Use $${agent.id}-${agent.skills[0].id} for this task."\npolicy:\n  allow_implicit_invocation: true${openAiDependencies}`);
  await writeText(path.join(codexRoot, "README.md"), readme(agent));
  await copyFile(path.join(root, "LICENSE"), path.join(codexRoot, "LICENSE"));

  await writeJson(path.join(claudeRoot, ".claude-plugin/plugin.json"), {
    name: agent.id,
    version: agent.version,
    description: agent.shortDescription,
    author: { name: "AI Office contributors" },
    license: agent.license,
  });
  await writeText(path.join(claudeRoot, "agents", `${agent.id}.md`), claudeAgentMarkdown(agent));
  await writeText(path.join(claudeRoot, "README.md"), readme(agent));
  await copyFile(path.join(root, "LICENSE"), path.join(claudeRoot, "LICENSE"));

  for (const skill of agent.skills) {
    const markdown = skillMarkdown(agent, skill);
    await writeText(path.join(codexRoot, "skills", skill.id, "SKILL.md"), markdown);
    await writeText(path.join(claudeRoot, "skills", skill.id, "SKILL.md"), markdown);
  }
}

console.log(`Generated website catalog and native packages for ${catalog.agents.length} agents.`);
