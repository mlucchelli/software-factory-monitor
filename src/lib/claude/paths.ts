import path from "node:path";
import { claudeHome } from "../config";

export { claudeHome };

export const projectsDir = path.join(claudeHome, "projects");

export const initiativesDir = path.join(claudeHome, "initiatives");

export const agentsDir = path.join(claudeHome, "agents");

export const liveSessionsDir = path.join(claudeHome, "sessions");

/** Fixtures the demo generator writes; read only in demo mode. */
export const demoDir = path.join(claudeHome, "demo");
