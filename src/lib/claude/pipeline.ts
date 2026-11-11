import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_STEPS,
  type PhaseStep,
  parsePipeline,
} from "../pipeline-definition";
import { claudeHome } from "./paths";

const skillFile = path.join(claudeHome, "skills", "initiative", "SKILL.md");

let cached: { mtimeMs: number; steps: PhaseStep[] } | undefined;

/** The pipeline of the installed /initiative skill, or the built-in one when there is none. */
export async function loadPipeline(): Promise<PhaseStep[]> {
  try {
    const { mtimeMs } = await stat(skillFile);
    if (cached?.mtimeMs !== mtimeMs) {
      const steps = parsePipeline(await readFile(skillFile, "utf8"));
      cached = { mtimeMs, steps: steps ?? DEFAULT_STEPS };
    }
    return cached.steps;
  } catch {
    return DEFAULT_STEPS;
  }
}
