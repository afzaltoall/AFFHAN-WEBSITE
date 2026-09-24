# Rules for AI agents in this repository

These bind every agent working here (Antigravity, Claude Code, Codex, or any
other) and replace what this file said before 24 September 2026. On 23
September an agent read the old version as permission to push on a phrase:
it merged an unreviewed commit of the whole working tree into `main`, pushed
it live, and pushed a feature branch as well.

## Pushing

- Push only on the user's explicit "go" for that specific change. A standing
  phrase, a general instruction to deploy, or a go given for an earlier
  change does not count. Every push needs its own.
- Before asking for that go, show the user:
  1. a clean build: `npx next build --webpack`, or `npm run build` when
     `prisma/schema.prisma` has changed, with the dev server stopped first
     (on Windows the running dev server locks Prisma's engine);
  2. the full diff of everything that is about to reach `main`.
- Only `main` is ever pushed. Finish work on a local branch, merge it into
  `main` locally, then `git push origin main`. Never push any other branch:
  every pushed branch starts a paid Vercel preview build.
- Never bypass the pre-push hook (`git push --no-verify`). It refuses every
  push the user has not approved for that exact commit. When it refuses,
  stop and ask the user.

## Committing

- Add files by name: `git add path/to/file`. Never `git add -A`, `git add .`,
  `git commit -a`, or an editor's commit-all button. The working tree holds
  other agents' unfinished work and diagnostic output that must not reach
  the repo.
- Check `git status` before every commit. Never commit auto-generated
  configuration files (for example a CLI-generated `vercel.json`) without the
  user's explicit review: broken routing or environment configuration must
  not reach the live site.
- Write commit messages that say what the commit actually contains.
