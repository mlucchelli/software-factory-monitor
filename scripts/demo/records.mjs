/*
 * Builders for the transcript lines Claude Code writes, with only the fields
 * the monitor reads. Ids are derived from a counter so a scenario is stable.
 */

let counter = 0;

function uuid() {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}

export function resetIds() {
  counter = 0;
}

const iso = (ms) => new Date(ms).toISOString();

/** Token usage that grows with the turn number, so cost and context look lived-in. */
function usage(turn, output) {
  return {
    input_tokens: 12,
    output_tokens: output,
    cache_read_input_tokens: 18_000 + turn * 2_600,
    cache_creation_input_tokens: 900,
  };
}

export class Transcript {
  constructor({ cwd, branch, model }) {
    this.cwd = cwd;
    this.branch = branch;
    this.model = model;
    this.lines = [];
    this.turn = 0;
    this.toolIds = 0;
  }

  push(record) {
    this.lines.push(JSON.stringify(record));
    return this;
  }

  base(type, at) {
    return {
      type,
      uuid: uuid(),
      timestamp: iso(at),
      cwd: this.cwd,
      gitBranch: this.branch,
    };
  }

  prompt(at, text) {
    return this.push({
      ...this.base("user", at),
      message: { role: "user", content: text },
    });
  }

  assistant(at, content, output = 220) {
    this.turn += 1;
    return this.push({
      ...this.base("assistant", at),
      message: {
        id: `msg_${uuid().slice(-12)}`,
        role: "assistant",
        model: this.model,
        content,
        usage: usage(this.turn, output),
      },
    });
  }

  say(at, text) {
    return this.assistant(at, [{ type: "text", text }], 60 + text.length / 3);
  }

  /** A tool call; pass `result` to close it one second later, or leave it open. */
  tool(at, name, input, result) {
    this.toolIds += 1;
    const id = `toolu_${uuid().slice(-12)}`;
    this.assistant(at, [{ type: "tool_use", id, name, input }]);
    if (result !== undefined) {
      this.result(at + 1000, id, result);
    }
    return id;
  }

  result(at, toolUseId, text) {
    return this.push({
      ...this.base("user", at),
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: toolUseId, content: text },
        ],
      },
    });
  }

  /** The structured hand-back a sub-agent ends its run with. */
  report(at, fields) {
    const message = Object.entries(fields)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    this.tool(at, "SubagentHandback", { message }, "Delivered.");
    return message;
  }

  meta(at, record) {
    return this.push({ ...record, timestamp: iso(at) });
  }

  toString() {
    return `${this.lines.join("\n")}\n`;
  }
}
