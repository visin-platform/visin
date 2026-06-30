# Contributing to Visin

## Getting started

1. Fork the repository and clone your fork.
2. Follow the [Local Development](README.md#local-development) setup in the README.
3. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Branch naming

| Prefix | When to use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, config |
| `docs/` | Documentation only |
| `refactor/` | Refactoring without behaviour change |

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(vision-service): add export to CSV
fix(auth-service): reject empty JWT_SECRET at startup
docs: update local development setup
```

## Pull requests

- Keep PRs focused — one concern per PR.
- Include a short description of what changed and why.
- If your change touches a backend service, verify the relevant endpoints still work locally.
- If your change touches a frontend, verify it in a browser against the local dev server.

## Code style

- TypeScript strict mode is enabled — no `any` unless unavoidable.
- No `console.log` in committed code — use the existing error handling patterns.
- No commented-out code blocks.

## Environment variables

Never commit real credentials. Use the `.env.example` files as templates and keep secrets out of git.
