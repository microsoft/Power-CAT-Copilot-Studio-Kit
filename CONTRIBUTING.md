# Contributing

This project welcomes contributions and suggestions. Most contributions require you to
agree to a Contributor License Agreement (CLA) declaring that you have the right to,
and actually do, grant us the rights to use your contribution. For details, visit
https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need
to provide a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the
instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Rules for pull requests

These rules apply to all pull requests to the `main` branch.

- Copilot can review your pull request automatically. The review starts when you open the pull request, or the first time that you mark a draft pull request as ready for review. Copilot does not review again when you push more commits.
- We can merge a pull request only when all its review conversations are resolved. This includes the conversations that Copilot starts. For each comment, change the code, or reply and tell us why you do not agree. Then resolve the conversation.
- At least 1 maintainer must approve the pull request. A Copilot review is not an approval. If you push more commits after the approval, the pull request needs a new approval.
- If your pull request comes from a fork, the checks can wait until a maintainer approves the workflow runs.
- If GitHub blocks your push because it found a secret, remove the secret from your commits. Do not bypass the block.

### Code scanning

CodeQL scans the `main` branch and the pull requests from branches in this repository. It does not scan pull requests from forks. If CodeQL finds a new alert in your pull request, fix the cause. If you think that the alert is a false positive, tell us why in the pull request. A maintainer then decides about the alert.

If you find a secret, personal data, or other private data in this repository, do not write it in an issue or a pull request. Report it as described in [SECURITY.md](SECURITY.md).

## Contribute to the code apps

The `code-apps` folder has the source code of 2 Power Apps code apps:

- Copilot Agent Kit for Makers, in `code-apps/makers`
- Copilot Agent Kit for Admins, in `code-apps/admin`

For the setup steps of an app, see the `README.md` file in the folder of the app.

### Before you start

- For a large change, open an issue first. Tell us what you want to change and why. Then we can agree on the approach before you write the code.
- Use Node.js 22.13 or later.
- Install the packages with `npm ci`. Do not use `npm install`, because it can change `package-lock.json`.
- Some paths in the repository are long. On Windows, clone the repository with `git clone -c core.longpaths=true <URL>`, into a folder that OneDrive or a similar service does not synchronize.
- Some comments in the code refer to internal design documents, for example a spec number, a PRD section, or a Figma node. These documents are not in this repository. You do not need them to change the code.

### Checks for each pull request

Run these commands in the folder of each app that you change. The **Code apps** workflow runs the same checks on Node.js 22.13.0 and Node.js 26.

| Command | Expected result |
| --- | --- |
| `npm ci` | The command completes without errors. |
| `npm run build` | The type check and the build complete without errors. |
| `npm test` | All tests pass. |
| `npm run lint` | 0 errors, and no new warnings. |
| `git status --porcelain` | No output. The checks do not change or add files. |

Run the checks with the placeholder values in `power.config.json`. A test of the Makers app fails when the file has the ID of your flow. To restore the file, run `git checkout -- power.config.json`.

### Rules for code changes

- Do not skip, remove, or weaken a test to make a check pass. When you fix a bug, add a test that fails without the fix.
- Do not change the dependency versions or `package-lock.json` in a pull request for a feature or a bug fix. Use a separate pull request for dependency changes.
- Keep the placeholder values in `power.config.json`. Do not commit the IDs of environments, apps, or flows. Do not commit keys, tokens, or other secrets.
- If a test needs a value that looks like a secret, make the value from parts when the test runs. Then secret scanning does not find it. Use this only for fake values. Do not commit a real secret, also not in parts.
- Do not commit the new `*.Schema.json` files that `npx power-apps refresh-data-source` writes. They have values from your environment.
- Do not write user data to the browser console. For example, do not write names, email addresses, user IDs, or tokens.
- The 2 apps have the same copy of the Agent Library code, in `src/features/agent-library/library`. If you change this code in 1 app, make the same change in the other app. The workflow compares the 2 copies.
- Use LF line ends. The workflow fails when a text file in `code-apps` has CRLF line ends in the repository. To change CRLF line ends to LF, run `git -c core.autocrlf=true add --renormalize -- code-apps` for files that are in the repository, and `git -c core.autocrlf=true add <file>` for new files. Then commit.
- Update the `README.md` file of the app when you change a command, a prerequisite, a data source, the data that the app sends, or a known issue.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/). Use one of these scopes:

| Scope | Use it for |
| --- | --- |
| `makers` | A change to `code-apps/makers` only |
| `admin` | A change to `code-apps/admin` only |
| `code-apps` | A change to both apps, or to the shared files in `code-apps` |

Examples:

- `fix(makers): show the agent name in the review summary`
- `docs(code-apps): change the minimum Node.js version`

### How we merge pull requests

This repository is the main copy of the code app source. We merge pull requests into the `main` branch. For the review and merge rules, see [Rules for pull requests](#rules-for-pull-requests).
