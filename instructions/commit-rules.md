# Agent Commit Rules

## Git identity
- `user.name = Xanoster` / `user.email = techypankaj@gmail.com`
- Verify with `git config user.name` and `git config user.email` before pushing.

## Commits
- Split logically separate changes into individual commits.
- Use imperative-style messages with a scope: `feat:`, `fix:`, `chore:`, etc.
- Avoid vague messages like `update stuff` or `changes`.

## Before push
- Check `git status` and `git log --oneline`.
- Confirm branch and remote are correct.
- Push only with the `Xanoster` account.
