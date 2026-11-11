import json, os, glob, time, collections, sys

ROOT = os.path.expanduser("~/.claude/projects")
CUTOFF = time.time() - 10*86400
PRICE = {"claude-fable-5-1":(10,50,0.25),"claude-opus-5":(5,25,0.5),"claude-sonnet-5":(2,10,0.2),"claude-haiku-4-5":(1,5,0.1)}

def price(model):
    for k,v in PRICE.items():
        if model.startswith(k): return v
    return (5,25,0.5)

roles = collections.defaultdict(lambda: dict(
    agents=0, cost=0.0, out=0, cache_w=0, cache_r=0, inp=0,
    tools=collections.Counter(), tool_bytes=collections.Counter(),
    result_bytes=0, text_bytes=0, text_blocks=0, turns=0,
    dup_reads=0, reads=0, big_results=[], spawned=collections.Counter(), ctx_peak=[]))

for meta_path in glob.glob(os.path.join(ROOT, "*", "*", "subagents", "agent-*.meta.json")):
    jsonl = meta_path.replace(".meta.json", ".jsonl")
    if not os.path.exists(jsonl) or os.path.getmtime(jsonl) < CUTOFF: continue
    meta = json.load(open(meta_path))
    role = meta.get("agentType", "?")
    r = roles[role]; r["agents"] += 1
    seen_msg = None; files_read = collections.Counter(); ctx = 0
    for line in open(jsonl, errors="replace"):
        try: d = json.loads(line)
        except Exception: continue
        m = d.get("message") or {}
        c = m.get("content")
        if d.get("type") == "assistant":
            u = m.get("usage") or {}
            mid = m.get("id")
            if mid != seen_msg:
                seen_msg = mid
                pi, po, pc = price(m.get("model",""))
                r["out"] += u.get("output_tokens",0)
                r["cache_w"] += u.get("cache_creation_input_tokens",0)
                r["cache_r"] += u.get("cache_read_input_tokens",0)
                r["inp"] += u.get("input_tokens",0)
                r["cost"] += (u.get("input_tokens",0)*pi + u.get("output_tokens",0)*po
                              + u.get("cache_read_input_tokens",0)*pc
                              + u.get("cache_creation_input_tokens",0)*pi*1.25)/1e6
                ctx = max(ctx, u.get("input_tokens",0)+u.get("cache_read_input_tokens",0)+u.get("cache_creation_input_tokens",0))
                r["turns"] += 1
            if isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict): continue
                    if b.get("type") == "tool_use":
                        name = b.get("name","?"); r["tools"][name] += 1
                        size = len(json.dumps(b.get("input") or {}))
                        r["tool_bytes"][name] += size
                        if name == "Read":
                            fp = (b.get("input") or {}).get("file_path","")
                            files_read[fp] += 1; r["reads"] += 1
                        if name == "Agent":
                            r["spawned"][(b.get("input") or {}).get("subagent_type","?")] += 1
                    elif b.get("type") == "text":
                        t = b.get("text") or ""
                        r["text_bytes"] += len(t); r["text_blocks"] += 1
        elif d.get("type") == "user" and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    cc = b.get("content")
                    s = cc if isinstance(cc,str) else json.dumps(cc)
                    r["result_bytes"] += len(s)
                    if len(s) > 60000: r["big_results"].append(len(s))
    r["dup_reads"] += sum(v-1 for v in files_read.values() if v > 1)
    r["ctx_peak"].append(ctx)

rows = sorted(roles.items(), key=lambda kv: -kv[1]["cost"])
print(f"{'role':22} {'n':>3} {'cost$':>8} {'out_tok':>9} {'cacheW':>9} {'cacheR(M)':>9} {'turns':>6} {'tools':>6} {'res_MB':>7} {'txt_KB':>7} {'dupRd':>6} {'ctxAvg':>7}")
for role, r in rows:
    print(f"{role:22} {r['agents']:>3} {r['cost']:>8.2f} {r['out']:>9,} {r['cache_w']:>9,} {r['cache_r']/1e6:>9.1f} {r['turns']:>6} {sum(r['tools'].values()):>6} {r['result_bytes']/1e6:>7.1f} {r['text_bytes']/1e3:>7.1f} {r['dup_reads']:>6} {sum(r['ctx_peak'])//max(1,len(r['ctx_peak'])):>7,}")
print()
for role, r in rows[:6]:
    print(role, "| top tools:", ", ".join(f"{k}×{v}" for k,v in r["tools"].most_common(8)))
    if r["spawned"]: print("   spawned:", dict(r["spawned"]))
    print("   avg text block:", int(r["text_bytes"]/max(1,r["text_blocks"])), "chars ·",
          "avg result:", int(r["result_bytes"]/max(1,sum(r['tools'].values()))), "chars ·",
          "results>60KB:", len(r["big_results"]))
