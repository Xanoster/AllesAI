# Agent Commit Rules

Read this file before any `git add`, `git commit`, `git push`, or history rewrite.

---

## Git identity

- Always use this git identity for commits and pushes in this repo:
  - `user.name = Xanoster`
  - `user.email = techypankaj@gmail.com`
- Before committing or pushing, verify:
  - `git config user.name`
  - `git config user.email`

---

## Commit strategy

- Do not make one giant commit when the changes are logically separable.
- Stage related changes individually so each important unit of work has its own commit.
- Keep unrelated edits out of the same commit.
- Prefer file-based staging first. If one file contains unrelated changes, split carefully and only combine when the changes truly belong together.

---

## Commit messages

- Use clear, professional commit messages.
- Prefer imperative style and a concise scope when useful.
- Good examples:
  - `feat: add shared results lane for council output`
  - `fix: correct consensus readiness gating`
  - `chore: update local model detection rules`
- Avoid vague messages like:
  - `update stuff`
  - `changes`
  - `fixes`

---

## Before push

- Confirm the branch and remote are correct.
- Review `git status` and `git log --oneline` before pushing.
- Push only after commit authorship and commit grouping look right.
- If force-pushing is required, use the safest option available and verify the target branch first.

---

## Default workflow

1. Read this file.
2. Check `git status`.
3. Verify `git config user.name` and `git config user.email`.
4. Group changes into logical commits.
5. Write strong commit messages.
6. Review recent commits.
7. Push with the `Xanoster` account only.
