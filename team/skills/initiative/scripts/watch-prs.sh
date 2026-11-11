#!/usr/bin/env bash
# Usage: watch-prs.sh <state-dir> <owner/repo#number>...
# Prints one line per PR whose state, failing checks, or human activity changed since the last poll.
# Env: INTERVAL (seconds, default 300), ONCE=1 for a single pass.
# Agents share the owner's GitHub account, so their comments are told apart by the hidden marker below, not by author.
set -uo pipefail

state_dir=$1
shift
mkdir -p "$state_dir"
interval=${INTERVAL:-300}
agent_marker='<!-- acme-agent:'
bot_logins='\[bot\]$|^(preview-bot|dependabot|renovate|github-actions|linear)'

check_pr() {
  local ref=$1
  local repo=${ref%#*}
  local number=${ref#*#}
  local state_file="$state_dir/$(tr '/#' '__' <<<"$ref")"

  local pr inline
  pr=$(gh pr view "$number" -R "$repo" --json state,comments,reviews,statusCheckRollup) || return 1
  inline=$(gh api "repos/$repo/pulls/$number/comments" --paginate \
    --jq '.[] | {login: .user.login, body: .body, at: .created_at}' | jq -s .) || return 1

  local signature
  signature=$(jq -rn --argjson pr "$pr" --argjson inline "$inline" --arg marker "$agent_marker" --arg bots "$bot_logins" \
    --arg ignored_checks "${IGNORED_CHECKS:-^$}" \
    --arg ignored_body "${IGNORED_BODY:-A preview environment is available|<!-- linear-linkback -->}" '
    def failed: ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"];
    ([ ($pr.comments[] | {login: .author.login, body, at: .createdAt}),
       ($pr.reviews[] | select((.body // "") != "") | {login: .author.login, body, at: .submittedAt}),
       $inline[] ]
     | map(select((.login | test($bots) | not) and ((.body // "") | contains($marker) | not)
                  and ((.body // "") | test($ignored_body) | not)))) as $human
    | ([$pr.statusCheckRollup[]? | select((.conclusion // .state) as $s | failed | index($s)) | (.name // .context) | select(test($ignored_checks) | not)] | unique | join(",")) as $failing
    | "state=\($pr.state) failing=[\($failing)] human_activity=\($human | length) last_human=\(if ($human | length) == 0 then "-" else ($human | max_by(.at) | "\(.login)@\(.at)") end)"')

  if [[ ! -f $state_file ]]; then
    echo "BASELINE $ref $signature"
  elif [[ $(<"$state_file") != "$signature" ]]; then
    echo "CHANGED $ref $signature"
  fi
  echo "$signature" >"$state_file"
}

while :; do
  open=0
  for ref in "$@"; do
    if ! check_pr "$ref"; then
      echo "ERROR $ref could not be read"
      open=$((open + 1))
      continue
    fi
    grep -q '^state=OPEN' "$state_dir/$(tr '/#' '__' <<<"$ref")" && open=$((open + 1))
  done
  if ((open == 0)); then
    echo "ALL_CLOSED"
    exit 0
  fi
  [[ -n ${ONCE:-} ]] && exit 0
  sleep "$interval"
done
