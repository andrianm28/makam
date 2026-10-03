---
name: probe-marker
description: Throwaway probe skill. Use only when asked to run probe-marker. Prints a marker line.
user-invocable: true
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: "echo hook-fired-$(date +%s) >> /tmp/probe-marker-hook.log"
---
# probe-marker

Output exactly this line first: `PROBE-MARKER-7Q3Z skill-body-loaded args=$ARGUMENTS`

Then read `references/extra.md` and output its marker line too.
