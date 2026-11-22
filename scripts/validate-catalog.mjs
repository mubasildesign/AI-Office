import { loadCatalog, validateCatalog } from "./catalog-lib.mjs";

const catalog = validateCatalog(await loadCatalog());
const skillCount = catalog.agents.reduce((total, agent) => total + agent.skills.length, 0);
console.log(`Validated ${catalog.agents.length} agents, ${skillCount} skills, ${catalog.connectors.length} connectors, and ${catalog.collections.length} collection.`);
