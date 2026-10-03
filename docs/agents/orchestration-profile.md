# Orchestration profile

Everything project-specific that the orchestration skills read. Copy of
`profile-template.md`, installed by `sync.sh` as
`docs/agents/orchestration-profile.md` only when the project has no profile yet.
It never repeats what `/setup-matt-pocock-skills` already writes (tracker,
triage labels, domain docs): those fields are pointers to `docs/agents/*.md`.
Replace each `Value:` line.

## Repository and environment

The repository (owner/name) and the cloud environment or machine the threads run in.

Value: owner/name, environment id or name

## Branch naming

The branch name pattern threads use, including how a ticket number appears in it.

Value: e.g. feature/<ticket>-<slug>

## Issue tracker (pointer)

Where the tracker is described: this project's `docs/agents/issue-tracker.md`, written by `/setup-matt-pocock-skills`. Do not copy its content here.

Value: docs/agents/issue-tracker.md

## Triage labels (pointer)

Where the triage label vocabulary lives: `docs/agents/triage-labels.md`, written by `/setup-matt-pocock-skills` only when `triage` is installed. The `triage` skill is not installed by `sync.sh`; if this project does not have it, the file does not exist. Do not copy its content here. Replace `none` with `docs/agents/triage-labels.md` only when `triage` is installed.

Value: none

## Domain docs (pointer)

Where the glossary and decision records are described: `docs/agents/domain.md`, written by `/setup-matt-pocock-skills`. Do not copy its content here or rename the glossary file.

Value: docs/agents/domain.md

## Test seams

The public boundaries `tdd` tests at in this project, agreed with the owner before any test is written.

Value: list of seams

## Gate and CI commands

The exact commands that must pass before a branch is handed back, and the CI checks that must be green.

Value: e.g. npm test, npm run lint

## Merge hooks

Anything that runs or must be done at merge time (migrations, deploy steps, changelog, release notes).

Value: hooks, or none

## Money paths

The code paths where a mistake costs money or trust and which therefore get extra review and tests.

Value: paths or modules

## Model and effort tiers

Which model and effort level each role uses (coordinator, builder, reviewer, and so on).

Value: role -> model, effort

## Pull-request policy

Who opens pull requests, who merges, target branch, and what a pull request must contain.

Value: policy

## Owner language

The language the owner reads and the coordinator reports in.

Value: e.g. English

## Decision protocol

How threads raise a decision to the owner and how the answer is recorded.

Value: protocol

## Memory file

The file where the coordinator keeps durable notes between sessions.

Value: path

## Overview page

The page that shows the owner the current state of all threads and tickets.

Value: link or path

## Thread cap

The maximum number of threads running at the same time.

Value: number

## Context limit per role

How much context each role may use before it hands off to a fresh session.

Value: role -> limit

## Same-session fix-pass limit

How many fix passes a thread may do in the same session before a fresh session takes over.

Value: number

## Cadences

How often the coordinator checks threads, reviews progress and reports to the owner.

Value: intervals

## Report-back format

The shape of the final message a thread sends back to the coordinator.

Value: format
