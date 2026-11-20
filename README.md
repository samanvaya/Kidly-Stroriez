# Kidly Storiez

A bedtime app that turns something from a child's day into a short interactive story. A parent notes what happened and approves a story plan. The child then chooses what the hero does and sees what follows from each choice.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY (optional, see docs/SETUP.md)
npm start                 # then open http://localhost:3000 on your phone or laptop
```

Without an API key the app still works with a built-in offline story ("Offline story" badge). With a key, Claude writes a new story from what you enter ("Live" badge).

Check everything before you share a change: `./scripts/verify.sh`

## Documents

- [Product requirements](docs/REQUIREMENTS.md): the problem, users, core flow, and all functional, safety and non-functional requirements.
- [Project status](project-status.md) and [backlog](backlog.md): where we are and what is next.
- [Architecture](architecture.md): how it is built and why.
- [Setup](docs/SETUP.md): keys and running on a new machine.
- [Pitch one-pager](docs/pitch/README.md): the one-page pitch for the hackathon jury, with the basis for its numbers.

## Status

Hackathon demo (BL-001). Items tagged **[P]** in the requirements are proposals that the team has not confirmed yet.

## How to contribute

1. Read the requirements and the open questions at the end.
2. To change or add a requirement, open a pull request that edits `docs/REQUIREMENTS.md`. Keep the existing ID and change its text, or add the next free ID in that section.
3. When the team confirms a proposed item, change its source tag from P to B.
