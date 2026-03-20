# Contributing to TinyOp

Thanks for taking the time to contribute. TinyOp is a small, focused library and contributions should stay consistent with that fixes, edge cases, and well-reasoned additions, not feature creep. 

## Contributor License Agreement

**Before any contribution can be merged, you must agree to the following:**
If you are not comfortable with these terms, please open an issue to discuss the contribution rather than submitting a PR:

By submitting a pull request, issue fix, or any other contribution to this repository, you agree that:

1. You are the original author of the contribution, or have the right to submit it.
2. You grant the project maintainer (Baloperson) a perpetual, worldwide, irrevocable, royalty-free license to use, reproduce, modify, sublicense, and distribute your contribution under any license terms the maintainer chooses, including future commercial licensing arrangements.
3. Your contribution remains available under the GPL-3.0 license that governs this project.
4. You understand that the maintainer may in future offer the software under additional license terms (such as a commercial license) and that your contribution may be included under those terms.

This CLA exists to preserve the maintainer's ability to dual-license the project in the future without needing to track down every contributor for permission. 
Note: This is standard for projects that may dual-license. Individual contributors retain copyright over their work, you're just granting permission for it to be used in this project under both GPL and potential future commercial licenses.
---

## What to contribute

**Good contributions:**

- Bug fixes with a clear description of what was wrong and how to verify it's fixed
- Edge cases in spatial queries, transactions, or event handling that produce incorrect results
- Performance improvements with benchmark evidence
- Documentation corrections — wrong API shapes, misleading examples, typos
- Tests for untested behaviour

**Discuss first (open an issue before writing code):**

- New API methods or changes to existing method signatures
- Changes to the spatial indexing strategy or query engine
- Anything that would increase the bundle size meaningfully
- `TinyOp+` changes involving sync or vector clock behaviour

**Out of scope:**

- Persistence backends — `store.dump()` and `store.checkpoint()` are the persistence boundary
- Framework integrations (React hooks, Vue plugins, etc.) — these belong in separate packages
- TypeScript types — may be added as a separate `.d.ts` file in future

---

## How to contribute

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep it focused — one fix or addition per PR.
3. Test it manually against the relevant scenarios. There is no automated test suite yet; describe in the PR how you verified the change works and doesn't break existing behaviour.
4. Open a pull request with a clear title and description. Reference any related issue.

---

## Code style

TinyOp core is intentionally dense. Match the existing style:

- No dependencies, no build step
- Compact but not obfuscated — variable names should be readable in context
- New public API methods follow the existing naming conventions (`find`, `near`, `get`, `create`, etc.)
- No TypeScript in the source files
- No comments in the minified-style sections of `TinyOp.js` — the README is the documentation

---

## Reporting bugs

Open an issue with:

- The version of `TinyOp.js` you are using
- A minimal reproduction — ideally a self-contained code snippet
- What you expected to happen and what actually happened
- Node version and environment if relevant (browser, React Native, etc.)

---

## License

By contributing, you agree that your contributions will be licensed under GPL-3.0, and that you grant the additional rights described in the Contributor License Agreement above.

Thanks for contributing.
