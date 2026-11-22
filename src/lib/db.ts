import Dexie, { type Table } from "dexie";
import { migrateCompany } from "./schema";
import type { CompanySpec } from "./studio-types";

interface CompanyRow { id: string; name: string; updatedAt: string; data: CompanySpec }
interface MetaRow { key: string; value: string }

class StudioDatabase extends Dexie {
  companies!: Table<CompanyRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("ai-office-studio-v2");
    this.version(1).stores({ companies: "id, updatedAt", meta: "key" });
  }
}

let database: StudioDatabase | null = null;
function db() {
  database ??= new StudioDatabase();
  return database;
}

async function readLegacyCompany(): Promise<unknown | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const request = indexedDB.open("ai-office-studio");
    request.onupgradeneeded = () => { request.transaction?.abort(); resolve(null); };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const legacy = request.result;
      if (!legacy.objectStoreNames.contains("workspace")) { legacy.close(); resolve(null); return; }
      const get = legacy.transaction("workspace", "readonly").objectStore("workspace").get("company");
      get.onsuccess = () => { legacy.close(); resolve(get.result ?? null); };
      get.onerror = () => { legacy.close(); resolve(null); };
    };
  });
}

export interface LoadResult { company: CompanySpec | null; recovered: boolean; error?: string }

export async function loadActiveCompany(): Promise<LoadResult> {
  try {
    const active = await db().meta.get("activeCompanyId");
    const row = active ? await db().companies.get(active.value) : await db().companies.orderBy("updatedAt").last();
    if (row) {
      try { return { company: migrateCompany(row.data), recovered: false }; }
      catch (error) { return { company: null, recovered: false, error: `Saved company could not be read: ${error instanceof Error ? error.message : "invalid data"}` }; }
    }
    const legacy = await readLegacyCompany();
    if (legacy) {
      try { const company = migrateCompany(legacy); await saveCompany(company); return { company, recovered: true }; }
      catch { return { company: null, recovered: false }; }
    }
    return { company: null, recovered: false };
  } catch (error) {
    return { company: null, recovered: false, error: error instanceof Error ? error.message : "Browser storage is unavailable" };
  }
}

export async function saveCompany(company: CompanySpec) {
  const data = { ...company, agents: company.agents.map((agent) => ({ ...agent, state: "idle" as const })) };
  await db().transaction("rw", db().companies, db().meta, async () => {
    await db().companies.put({ id: company.id, name: company.name, updatedAt: company.updatedAt, data });
    await db().meta.put({ key: "activeCompanyId", value: company.id });
  });
}

export async function listCompanies() {
  return (await db().companies.orderBy("updatedAt").reverse().toArray()).map(({ id, name, updatedAt, data }) => ({ id, name, updatedAt, agents: data.agents.length }));
}

export async function switchCompany(id: string) {
  const row = await db().companies.get(id);
  if (!row) return null;
  await db().meta.put({ key: "activeCompanyId", value: id });
  return migrateCompany(row.data);
}

export async function deleteCompany(id: string) {
  await db().companies.delete(id);
}
