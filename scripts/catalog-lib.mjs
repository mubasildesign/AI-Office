import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(file) {
  return JSON.parse(await readFile(path.join(root, file), "utf8"));
}

export async function loadCatalog() {
  const names = (await readdir(path.join(root, "catalog/agents")))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const agents = await Promise.all(
    names.map((name) => readJson(path.join("catalog/agents", name))),
  );
  const [connectors, collections, departments] = await Promise.all([
    readJson("catalog/connectors.json"),
    readJson("catalog/collections.json"),
    readJson("catalog/departments.json"),
  ]);

  return {
    schemaVersion: "1.0.0",
    agents,
    connectors,
    collections,
    departments,
  };
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function uniqueBy(items, getId, label, errors) {
  const ids = new Set();
  for (const item of items) {
    const id = getId(item);
    assert(!ids.has(id), `Duplicate ${label}: ${id}`, errors);
    ids.add(id);
  }
  return ids;
}

export function validateCatalog(catalog) {
  const errors = [];
  assert(catalog.schemaVersion === "1.0.0", "Unsupported schema version", errors);
  assert(catalog.agents.length === 6, "V1 must contain exactly six agents", errors);

  const departmentIds = uniqueBy(catalog.departments, (item) => item.id, "department", errors);
  const connectorIds = uniqueBy(catalog.connectors, (item) => item.id, "connector", errors);
  const agentIds = uniqueBy(catalog.agents, (item) => item.id, "agent", errors);
  uniqueBy(catalog.collections, (item) => item.id, "collection", errors);

  for (const connector of catalog.connectors) {
    assert(slugPattern.test(connector.id), `Invalid connector id: ${connector.id}`, errors);
    assert(connector.optional === true, `${connector.id} must remain optional in V1`, errors);
    assert(connector.capabilities.length > 0, `${connector.id} needs capabilities`, errors);
    assert(connector.authentication.length > 20, `${connector.id} needs authentication guidance`, errors);
  }

  const globalSkills = new Set();
  for (const agent of catalog.agents) {
    assert(slugPattern.test(agent.id), `Invalid agent id: ${agent.id}`, errors);
    assert(semverPattern.test(agent.version), `Invalid version for ${agent.id}`, errors);
    assert(agent.roleCharter.length > 80, `${agent.id} needs a substantive role charter`, errors);
    assert(agent.skills.length >= 4 && agent.skills.length <= 6, `${agent.id} must have 4-6 skills`, errors);
    assert(agent.nonGoals.length >= 3, `${agent.id} needs at least three non-goals`, errors);
    assert(agent.platforms.includes("codex") && agent.platforms.includes("claude"), `${agent.id} must support both hosts`, errors);
    assert(agent.accent === "emerald", `${agent.id} must use the locked V1 accent`, errors);
    for (const departmentId of agent.departmentIds) {
      assert(departmentIds.has(departmentId), `${agent.id} references unknown department ${departmentId}`, errors);
    }
    for (const connectorId of agent.connectorIds) {
      assert(connectorIds.has(connectorId), `${agent.id} references undeclared connector ${connectorId}`, errors);
    }

    const localSkills = uniqueBy(agent.skills, (item) => item.id, `skill in ${agent.id}`, errors);
    for (const skill of agent.skills) {
      const globalId = `${agent.id}/${skill.id}`;
      assert(!globalSkills.has(globalId), `Duplicate global skill: ${globalId}`, errors);
      globalSkills.add(globalId);
      assert(localSkills.has(skill.id) && slugPattern.test(skill.id), `Invalid skill id: ${globalId}`, errors);
      assert(skill.inputs.length > 0, `${globalId} needs inputs`, errors);
      assert(skill.workflow.length >= 3, `${globalId} needs at least three workflow steps`, errors);
      assert(skill.outputs.length > 0, `${globalId} needs outputs`, errors);
      assert(skill.boundaries.length >= 3, `${globalId} needs at least three boundaries`, errors);
      for (const key of ["direct", "indirect", "incomplete", "negative", "boundary"]) {
        assert(Boolean(skill.evaluations[key]), `${globalId} is missing ${key} evaluation`, errors);
      }
      const serialized = JSON.stringify(skill).toLowerCase();
      assert(!serialized.includes("http://") && !serialized.includes("https://"), `${globalId} contains remote instructions`, errors);
    }
  }

  for (const collection of catalog.collections) {
    assert(collection.agentIds.length > 0, `${collection.id} cannot be empty`, errors);
    uniqueBy(collection.agentIds, (item) => item, `agent reference in ${collection.id}`, errors);
    for (const agentId of collection.agentIds) {
      assert(agentIds.has(agentId), `${collection.id} references unknown agent ${agentId}`, errors);
    }
  }

  const forbiddenKeys = new Set(["hooks", "scripts", "mcpServers", "credentials", "remoteInstructions"]);
  const walk = (value, trail = "catalog") => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert(!forbiddenKeys.has(key), `Forbidden V1 field ${trail}.${key}`, errors);
      walk(child, `${trail}.${key}`);
    }
  };
  walk(catalog);

  if (errors.length) {
    throw new Error(`Catalog validation failed:\n- ${errors.join("\n- ")}`);
  }
  return catalog;
}

export { root };
