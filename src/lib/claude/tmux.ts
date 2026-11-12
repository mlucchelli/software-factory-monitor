import { captureTerminal, sendToTerminal } from "../terminal";
import type { KeyStep, TerminalRef } from "../terminal/ref";
import type { ScreenPrompt, ScreenPromptOption } from "./types";

export { captureTerminal };

const FOOTER_PATTERN = /Esc to cancel|Enter to (select|confirm)/;
const RULE_PATTERN = /^─{10,}$/;
const OPTION_PATTERN = /^(❯\s*)?(\d+)\.\s+(?:\[([ ✔x])\]\s+)?(.*)$/;
const TEXT_OPTION_PATTERN = /^Type something/;
const CHAT_OPTION_PATTERN = /^Chat about this/;
const TABS_PREFIX = "←";

export type KeyAction =
  | { type: "options"; numbers: number[]; advance: boolean }
  | { type: "text"; number: number; text: string };

function singleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Reads the selection dialog Claude Code draws at the bottom of the pane (AskUserQuestion,
 * permission prompts). An open AskUserQuestion is not in the transcript until it is answered,
 * so the screen is the only place its current question and options exist.
 */
export function parseScreenPrompt(screen: string): ScreenPrompt | undefined {
  const lines = screen.split("\n").map((line) => line.trimEnd());
  const lastContent = lines.findLastIndex((line) => line.trim());
  const footerIndex = lines.findLastIndex((line) => FOOTER_PATTERN.test(line));
  const hasFooter = footerIndex !== -1 && lastContent - footerIndex <= 2;
  // The review step of a multi-question dialog ends on its options, with no footer line.
  const endIndex = hasFooter
    ? footerIndex
    : OPTION_PATTERN.test(lines[lastContent]?.trim() ?? "")
      ? lastContent + 1
      : -1;
  if (endIndex === -1) {
    return undefined;
  }

  const options: ScreenPromptOption[] = [];
  let firstOptionIndex = -1;
  let description: string[] = [];
  for (let index = endIndex - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || RULE_PATTERN.test(trimmed)) {
      continue;
    }
    const match = OPTION_PATTERN.exec(trimmed);
    if (match) {
      options.unshift({
        number: Number(match[2]),
        label: match[4].trim(),
        description: description.length > 0 ? description.join(" ") : undefined,
        checked: match[3] === undefined ? undefined : match[3] !== " ",
        focused: match[1] !== undefined,
      });
      description = [];
      firstOptionIndex = index;
      continue;
    }
    if (trimmed === "Submit") {
      continue;
    }
    if (/^\s{2,}/.test(lines[index]) && firstOptionIndex !== -1) {
      description.unshift(trimmed);
      continue;
    }
    break;
  }
  if (options.length === 0) {
    return undefined;
  }

  const above = lines
    .slice(0, firstOptionIndex)
    .map((line) => line.trim())
    .filter((line) => line && !RULE_PATTERN.test(line));
  const questionLine = above.at(-1);
  const tabsLine = above.at(-2);
  const tabs =
    tabsLine?.startsWith(TABS_PREFIX) && questionLine
      ? tabsLine
          .replace(/^←\s*|\s*→$/g, "")
          .split(/\s{2,}/)
          .filter(Boolean)
      : questionLine?.startsWith(TABS_PREFIX)
        ? questionLine
            .replace(/^←\s*|\s*→$/g, "")
            .split(/\s{2,}/)
            .filter(Boolean)
        : undefined;

  return {
    question:
      questionLine && !questionLine.startsWith(TABS_PREFIX)
        ? questionLine
        : undefined,
    tabs,
    multiSelect: options.some((option) => option.checked !== undefined),
    options: options.filter(
      (option) => !CHAT_OPTION_PATTERN.test(option.label),
    ),
    footer: hasFooter ? lines[footerIndex].trim() : undefined,
  };
}

export function isTextOption(option: ScreenPromptOption): boolean {
  return TEXT_OPTION_PATTERN.test(option.label);
}

/** Checks an action against the dialog on screen right now and returns its keystrokes. */
export function actionSteps(
  prompt: ScreenPrompt,
  action: KeyAction,
): KeyStep[] {
  const byNumber = new Map(
    prompt.options.map((option) => [option.number, option]),
  );
  if (action.type === "text") {
    const option = byNumber.get(action.number);
    const text = singleLine(action.text);
    if (!option || !isTextOption(option) || !text) {
      throw new Error("That free-text option is not on screen");
    }
    return [
      { literal: String(action.number) },
      { literal: text },
      { key: "Enter" },
    ];
  }
  const wanted = new Set(action.numbers);
  if (
    [...wanted].some((number) => {
      const option = byNumber.get(number);
      return !option || isTextOption(option);
    })
  ) {
    throw new Error("Those options are not on screen");
  }
  if (!prompt.multiSelect) {
    if (wanted.size !== 1) {
      throw new Error("Pick exactly one option");
    }
    return [{ literal: String([...wanted][0]) }];
  }
  // A digit toggles a checkbox, so only the options whose state differs are pressed.
  const steps: KeyStep[] = prompt.options
    .filter(
      (option) =>
        !isTextOption(option) &&
        wanted.has(option.number) !== (option.checked ?? false),
    )
    .map((option) => ({ literal: String(option.number) }));
  if (action.advance) {
    steps.push({ key: "Tab" });
  }
  if (steps.length === 0) {
    throw new Error("Nothing to change");
  }
  return steps;
}

export async function sendAction(
  terminal: TerminalRef,
  prompt: ScreenPrompt,
  action: KeyAction,
) {
  await sendToTerminal(terminal, actionSteps(prompt, action));
}

export async function sendMessage(terminal: TerminalRef, text: string) {
  const line = singleLine(text);
  if (!line) {
    throw new Error("Message is empty");
  }
  await sendToTerminal(terminal, [{ literal: line }, { key: "Enter" }]);
}
