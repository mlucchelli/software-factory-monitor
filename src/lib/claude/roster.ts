import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { agentsDir } from "./paths";

export interface RoleDefinition {
  name: string;
  description: string;
  model?: string;
  color?: string;
  modes: string[];
  mission?: string;
  file: string;
}

const MODES_PATTERN = /modes are ([a-z-]+(?:,\s*[a-z-]+)*)/i;

function parseFrontmatter(markdown: string): {
  fields: Record<string, string>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown);
  if (!match) {
    return { fields: {}, body: markdown };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const field = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (field) {
      fields[field[1]] = field[2].trim();
    }
  }
  return { fields, body: match[2] };
}

function missionOf(body: string): string | undefined {
  const opening = body
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => paragraph.startsWith("You are"));
  return opening?.split(/(?<=\.)\s/)[0];
}

export async function listRoles(): Promise<RoleDefinition[]> {
  let files: string[];
  try {
    files = (await readdir(agentsDir)).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
  const roles = await Promise.all(
    files.map(async (file): Promise<RoleDefinition | null> => {
      const markdown = await readFile(path.join(agentsDir, file), "utf8");
      const { fields, body } = parseFrontmatter(markdown);
      if (!fields.name) {
        return null;
      }
      const description = fields.description ?? "";
      return {
        name: fields.name,
        description,
        model: fields.model,
        color: fields.color,
        modes:
          MODES_PATTERN.exec(description)?.[1]
            .split(",")
            .map((mode) => mode.trim()) ?? [],
        mission: missionOf(body),
        file: path.join(agentsDir, file),
      };
    }),
  );
  return roles.filter((role): role is RoleDefinition => role !== null);
}
