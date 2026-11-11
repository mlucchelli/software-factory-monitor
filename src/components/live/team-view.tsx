"use client";

import Link from "next/link";
import type { AgentInfo, AgentStatus, Snapshot } from "@/lib/claude/types";
import {
  formatAgo,
  projectName,
  roleStyle,
  TEAMS,
  type Team,
  teamOf,
} from "@/lib/client/present";
import { Chip, eventIcon, RoleBadge, StatusPill } from "../ui";

const RECENT_MS = 30 * 60_000;

const STATUS_ORDER: Record<AgentStatus, number> = {
  running: 0,
  reported: 1,
  idle: 2,
};

interface Member {
  agent: AgentInfo;
  sessionTitle: string;
}

function MemberRow({
  member,
  now,
  showRole,
}: {
  member: Member;
  now: number;
  showRole: boolean;
}) {
  const { agent } = member;
  const Icon = agent.lastEvent ? eventIcon(agent.lastEvent) : null;
  return (
    <li className="min-w-0">
      <Link
        href={`/agents/${agent.id}`}
        className="grid min-w-0 gap-1 rounded-lg px-2 py-2 transition-colors hover:bg-surface-raised"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showRole && <RoleBadge type={agent.type} />}
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {agent.description ?? agent.id}
          </span>
          {agent.ticket && <Chip>{agent.ticket}</Chip>}
          <StatusPill
            status={agent.status}
            reportStatus={agent.report?.status}
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1 truncate font-mono">
            {agent.lastEvent?.summary ?? member.sessionTitle}
          </span>
          <span className="shrink-0">{formatAgo(agent.lastActivity, now)}</span>
        </div>
      </Link>
    </li>
  );
}

function TeamCard({
  team,
  members,
  hidden,
  now,
}: {
  team: Team;
  members: Member[];
  hidden: number;
  now: number;
}) {
  const running = members.filter(
    (member) => member.agent.status === "running",
  ).length;
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-hairline bg-page/40 p-3">
      <header className="mb-1 flex items-center gap-2">
        <span className="flex -space-x-0.5">
          {team.roles.map((role) => (
            <span
              key={role}
              className="size-2.5 rounded-full ring-2 ring-surface"
              style={{ background: roleStyle(role).color }}
              aria-hidden
            />
          ))}
        </span>
        <h3 className="text-sm font-semibold">{team.label}</h3>
        <span className="ml-auto text-[11px] text-muted tabular">
          {running} running · {members.length} shown
        </span>
      </header>
      {members.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted">
          Nobody from this team is active.
        </p>
      ) : (
        <ul className="flex flex-col">
          {members.map((member) => (
            <MemberRow
              key={member.agent.id}
              member={member}
              now={now}
              showRole={team.roles.length !== 1 || team.key === "helpers"}
            />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-1 px-2 text-[11px] text-muted">{hidden} idle hidden</p>
      )}
    </article>
  );
}

function SessionsCard({
  snapshot,
  now,
  showIdle,
}: {
  snapshot: Snapshot;
  now: number;
  showIdle: boolean;
}) {
  const team = TEAMS.find((candidate) => candidate.key === "sessions") as Team;
  const sessions = snapshot.sessions.filter(
    (session) =>
      showIdle ||
      session.status === "running" ||
      now - session.lastActivity < RECENT_MS,
  );
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-hairline bg-page/40 p-3">
      <header className="mb-1 flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={{ background: roleStyle(team.roles[0]).color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold">{team.label}</h3>
        <span className="ml-auto text-[11px] text-muted tabular">
          {sessions.filter((session) => session.status === "running").length}{" "}
          running · {sessions.length} shown
        </span>
      </header>
      <ul className="flex flex-col">
        {sessions.map((session) => (
          <li
            key={`${session.project}/${session.id}`}
            className="grid min-w-0 gap-1 px-2 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {session.title ?? session.lastPrompt ?? session.id}
              </span>
              <StatusPill status={session.status} />
            </div>
            <p className="flex min-w-0 gap-2 text-[11px] text-muted">
              <span className="truncate font-mono">
                {projectName(session.cwd, session.project)}
              </span>
              <span className="shrink-0">{session.agents.length} agents</span>
              <span className="ml-auto shrink-0">
                {formatAgo(session.lastActivity, now)}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function TeamView({
  snapshot,
  now,
  showIdle,
}: {
  snapshot: Snapshot | null;
  now: number;
  showIdle: boolean;
}) {
  if (!snapshot) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Reading transcripts…
      </p>
    );
  }

  const byTeam = new Map<string, { members: Member[]; hidden: number }>(
    TEAMS.map((team) => [team.key, { members: [], hidden: 0 }]),
  );
  for (const session of snapshot.sessions) {
    const sessionTitle =
      session.title ?? projectName(session.cwd, session.project);
    for (const agent of session.agents) {
      const bucket = byTeam.get(teamOf(agent.type).key);
      if (!bucket) {
        continue;
      }
      const visible =
        showIdle ||
        agent.status !== "idle" ||
        now - agent.lastActivity < RECENT_MS;
      if (visible) {
        bucket.members.push({ agent, sessionTitle });
      } else {
        bucket.hidden += 1;
      }
    }
  }
  for (const bucket of byTeam.values()) {
    bucket.members.sort(
      (a, b) =>
        STATUS_ORDER[a.agent.status] - STATUS_ORDER[b.agent.status] ||
        b.agent.lastActivity - a.agent.lastActivity,
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {TEAMS.map((team) =>
        team.key === "sessions" ? (
          <SessionsCard
            key={team.key}
            snapshot={snapshot}
            now={now}
            showIdle={showIdle}
          />
        ) : (
          <TeamCard
            key={team.key}
            team={team}
            members={byTeam.get(team.key)?.members ?? []}
            hidden={byTeam.get(team.key)?.hidden ?? 0}
            now={now}
          />
        ),
      )}
    </div>
  );
}
