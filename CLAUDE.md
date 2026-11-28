# astwerk

A filter query language. `packages/astwerk` is the package: it parses query text such as `is:open label:bug,ui amount:10..40` into a syntax tree, binds the tree to a schema as a typed query, and writes the query back in one canonical form. Editors, filter panels, URL state and the translation to a backend query are built by the apps that use it.

The contributor workflow lives in @CONTRIBUTING.md. This file holds what applies across the repo: the design rules, what is left out on purpose, the conventions review holds code to, releases and tooling. The package README is the language definition and the whole API reference; there is no docs site. The package's architecture, decisions and gotchas go into `packages/astwerk/CLAUDE.md`. A path, name or value that the code already shows stays out of both CLAUDE.md files.

## Design rules

These rules are the design. Changing one is agreed with the maintainer before any code changes.

1. GitHub search is the inspiration and the baseline. astwerk covers every case GitHub's search syntax covers, whether or not an app needs it, and reads the text the way GitHub does. It departs where GitHub's behaviour is a problem, such as a query it rejects or a typo it silently reads as something else, and each departure is a recorded decision. Notations that only some apps need, such as `@me`, are not built in; apps add them with field types and tokens of their own.
2. The query text is the source of truth. The syntax tree, the typed query, a panel's state and a backend query are derived from it, and astwerk keeps no state of its own.
3. No dependencies and no host. astwerk uses no framework, DOM or browser API, so the same code runs in an editor, in a browser and on a Node server.
4. Parsing never throws. Partial or broken text, such as `status:`, an unclosed quote or a missing parenthesis, still gives a tree, with diagnostics for what is wrong.
5. There are two layers. The syntax tree holds positions and raw strings and knows no schema, so editors highlight and complete with it. Binding the tree to a schema gives the typed query, with typed values and a small, fixed set of conditions, which panels, predicates and backends read.
6. A filter has one canonical form. The same filter always writes the same text, and `canonical(canonical(text)) == canonical(text)` for every input.
7. Mistakes stay visible and harmless. An unknown field or an invalid value becomes a diagnostic and stays in the text, and evaluation treats it as no constraint, so a typo never empties a list. A value is invalid when its type cannot read it, such as `amount:abc`, or when the schema closes the list of values and leaves it out, such as `is:merged` for `enumOf(['open', 'closed'])`. Values are never checked against data, so a label that exists nowhere is a filter that matches nothing.
8. Dynamic values are `@` tokens, such as `@today-7d`. They stay as written in the canonical text, so a shared link keeps its meaning instead of the day it was made. The date type knows `@today`, and an app's field types add tokens such as `@me`.

## Left out on purpose

- Editor extensions, framework bindings and URL state. Apps build them on astwerk's functions, which hold all of the logic.
- Functions in queries, natural-language forms such as `between 10 and 40`, and nested field paths. A dotted key such as `field.priority` is one field name.
- A plugin registry. Field types, tokens on types and `expand` extend a schema, and schemas share fields by spreading them.
- Negating a group, as in `-(a OR b)`. A `-` negates one term or word.
- Dynamic values written any other way than as an `@` token.

## Recording a decision

A decision goes into `packages/astwerk/CLAUDE.md`: what the code does, why in a sentence or two, and the test that guards it, named in quotes with its file. The test fails when the behaviour breaks; break the source, run it, restore. What an earlier version did, measurements and the discussion that led there belong in the pull request.

A change to the syntax updates the README's syntax, grammar and canonical form sections and the tests together.

## Code conventions

- No comments. Names and structure carry the meaning.
- The one exception is short JSDoc on the public API, which is what the package exports from its entry.
  - A summary goes only where the name and type do not say it. Behaviour that surprises, such as what a function does with text it cannot read, goes there.
  - An option with a default has a `@defaultValue`. There is no `@param`, `@returns` or `@example`, because examples live in the README.
- Functions take an object parameter once their arguments stop being obvious.
- Loose equality (`==`, `!=`) unless identity matters (`Object.is`).
- Behaviour that differs per kind lives in an exhaustive table, not in `kind == 'x'` branches.
- String domain values are `as const` objects whose keys equal their values, with a derived type.
- A constant used by one file stays in that file. Only the package entry re-exports.
- Relative imports have no extension.
- Type-only modules are `.ts`, never `.d.ts`, since `skipLibCheck` would hide their errors.
- Examples and tests use everyday domains, such as an issue tracker or an order list, never the terms of an app that uses astwerk. A person in them is `ahmet`, with `tinastepe` where a surname is needed.

## Releases

- Maintainers write the changesets, on a contributor's PR too, for any change to the package's API or behaviour; docs and tests need none.
- The Changesets config has `format: false` because the formatter is `vp fmt`, configured in `vite.config.ts` where Changesets cannot find it; `pnpm version-packages` runs `changeset version && vp fmt`.
- The changelog reads GitHub, so a local `pnpm version-packages` needs `GITHUB_TOKEN=$(gh auth token)`.
- A prerelease starts with `pnpm changeset pre enter <tag>` and ends with `pnpm changeset pre exit`. The stable changelog is built from `.changeset/pre/`, so trim those files to what matters for the stable version first.
- The CI job is named `ci`, the name a ruleset on `main` requires, so renaming it blocks every merge.
- npm auth is trusted publishing (OIDC) with no token, and the trusted publisher allows only staging ("Allow npm publish" unticked), so CI never puts a version live. A maintainer approves each staged version on npmjs.com with 2FA. Only the `stage` job has `id-token: write`.
- `stage` stages each package of the publish plan with `npm stage publish`. Changesets cannot stage yet, so the job reads the `publish-plan.json` and `packages/*.tgz` that `changesets/action/pack` writes and runs npm itself, without a checkout, since npm refuses to run in a repo whose `devEngines` names pnpm. A tarball path starts with `./`, or npm reads it as a GitHub shorthand. npm runs through `npx` at a pinned version, since staging needs npm 11.15 or later, and Dependabot does not update that pin.
- A staged version counts as unpublished, so until it is approved every push to `main` plans it again and npm answers `E409 … previously staged`. `stage` skips such a version and fails only on other errors.
- `github-release` opens a draft GitHub release for each version `stage` staged, with its CHANGELOG section as the notes. A draft has no tag, and the tag ruleset keeps the Actions token from creating one, so no tag points at a version that is not approved. After approving on npm, the maintainer publishes the draft, which creates the tag. When `github-release` fails after staging, "Re-run failed jobs" runs it again for the same versions.
- `stage` passes `--provenance`, and provenance fails unless the package's `repository` (with `directory`) matches the repo.
- npm lets a package trust a workflow only once it exists, so the first version was published by hand (`pnpm release`). The package's Trusted Publisher settings trust `release.yml` of `tinas/astwerk` with no environment and "Allow npm publish" unticked; ticking it would let CI publish without approval.
- A new package name first gets a `0.0.0-stage` placeholder on npm, and the registry can show only the placeholder for a minute or two after a publish.
- The version PR is opened with the Actions token, so GitHub holds CI on it until it is approved ("Approve and run workflows"); `pack` runs `vp run ready` before anything is staged either way.
- `changeset-status.yml` runs on `pull_request_target` so fork PRs get the comment; it checks out and reads, never runs the PR's code.
- Actions are pinned to commit SHAs with the tag in a comment; Dependabot groups their updates monthly. `setup-vp` takes Node from `engines.node` (the newest release in the range), Vite+ from the catalog and pnpm from `devEngines`.
- pnpm refuses versions younger than a day (`minimumReleaseAge`). A dependency that is too new waits, rather than going into `minimumReleaseAgeExclude`.

## Tooling

- The package uses TypeScript 7 (tsgo) and builds its declarations with it.
- The package's `tsconfig.json` lists only ES libraries and no `types`, so a DOM, browser or Node API fails the type check (rule 3). Tests run in Vitest's Node environment.
- `vp test` runs `tests/**/*.test.ts` and type-checks `tests/**/*.test-d.ts`. `properties.test.ts` runs fast-check properties on random text and panel state.
- The published declarations use `NoInfer`, so apps need TypeScript 5.4 or later. The optional `typescript` peer and the README's requirements state it.

## Open work

- The GitHub release of `astwerk@0.1.0`, which was published by hand.
- Changesets cannot stage yet ([changesets/changesets#2025](https://github.com/changesets/changesets/issues/2025)). Once it can, `stage` becomes `changesets/action/publish` with that option.
- `vp run ready` does not check the README's TypeScript blocks. They type-check against the built package when extracted into a project that installs it, and that check belongs in `ready`.
- GitHub setup: the `tinas/astwerk` repo, Actions allowed to create pull requests (for the version PR), a `main` ruleset with squash merges and the `ci` check required, and a ruleset that lets only admins create tags.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
