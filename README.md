# Power CAT Copilot Studio Kit

The **Power CAT Copilot Studio Kit** is a comprehensive set of capabilities designed to augment [Microsoft Copilot Studio](https://aka.ms/CopilotStudio). The kit helps makers test custom copilots, use large language model to validate AI-generated content, and track aggregated key performance indicators (_coming soon_).

## Testing capabilities  
The Power CAT Copilot Studio Kit is a user-friendly application allows testers to configure copilots and tests sets. It has native capabilities such as Excel export or import for bulk creation and updates.

By running individual tests against the Direct Line API, the copilot responses are evaluated against expected results.
To further enrich results, additional data points can be retrieved from Azure Application Insights and from Dataverse, by analyzing Conversation Transcript records (to get the exact triggered topic name, intent recognition scores, etc.).
For AI-generated answers, that are by nature non-deterministic, AI Builder prompts are used to compare the generated answer with a sample answer or with validation instructions.

Today, the tool supports these types of tests:
- Response exact match.
- Attachments match.
- Topic match (requires Dataverse enrichment)
- Generative answers (requires AI Builder for response analysis, and Azure Application Insights for details on why an answer was or was not generated)

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/33496e94-0c7a-4e63-9291-9e461aa9b9e7)

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/25f071ff-6b4f-4f5f-b6a3-20193a2d1feb)

## Copilot KPIs
_Coming soon:_ agreggate and retain key performance indicators from your custom copilots without having to parse complex conversation transcripts.


# About this GitHub repo

The Power CAT Copilot Studio Kit GitHub Repo contains the source, releases, issues and backlog items of all components that are part of the Power CAT Copilot Studio Kit.

# Setup instructions and documentation

- [Prerequisites](./PREREQUISITES.md)
- [Installation instructions](./INSTALLATION_INSTRUCTIONS.md)
- [Configure users and teams](/SETUP_USERS_AND_TEAMS.md)
- [Configure copilots](./CONFIGURE_COPILOTS.md)
- [Configure tests](./CONFIGURE_TESTS.md)
- [Run tests](./RUN_TESTS.md)
- [Analyze test results](./ANALYZE_TEST_RESULTS.md)
- [Troubleshooting](./TROUBLESHOOT.md)

## Latest release

The latest shipped version is available via **[Releases](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/releases)**. From there, you can download the latest version of all managed solutions that have been tested and are ready for use. 

Stay up to date with our releases by **subscribing** to them: 
1. Select **Watch**
2. Select **Custom** > **Releases** > **Apply** to receive notifications about our releases

## Submit a feature request

Let us now by filing an issue. 
Before submitting your issue please search the [issues](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/issues) to ensure your issue has not already been reported

If your bug or feature request has already been reported, join the conversation by commenting and adding your reaction. Please use reactions to vote and not "+1" comments.
- 👍: upvote
- 👎: downvote

## Microsoft Open Source Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

Resources:

- [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)
- [Microsoft Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
- Contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with questions or concerns

## Trademarks 

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft’s Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.

## Security

Microsoft takes the security of our software products and services seriously, which includes all source code repositories managed through our GitHub organizations, which include [Microsoft](https://github.com/Microsoft), [Azure](https://github.com/Azure), [DotNet](https://github.com/dotnet), [AspNet](https://github.com/aspnet), [Xamarin](https://github.com/xamarin), and [our GitHub organizations](https://opensource.microsoft.com/).

If you believe you have found a security vulnerability in any Microsoft-owned repository that meets Microsoft's [Microsoft's definition of a security vulnerability](https://docs.microsoft.com/en-us/previous-versions/tn-archive/cc751383(v=technet.10)), please report it to us as described below.

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them to the Microsoft Security Response Center (MSRC) at [https://msrc.microsoft.com/create-report](https://msrc.microsoft.com/create-report).

If you prefer to submit without logging in, send email to [secure@microsoft.com](mailto:secure@microsoft.com).  If possible, encrypt your message with our PGP key; please download it from the the [Microsoft Security Response Center PGP Key page](https://www.microsoft.com/en-us/msrc/pgp-key-msrc).

You should receive a response within 24 hours. If for some reason you do not, please follow up via email to ensure we received your original message. Additional information can be found at [microsoft.com/msrc](https://www.microsoft.com/msrc).

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

  * Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
  * Full paths of source file(s) related to the manifestation of the issue
  * The location of the affected source code (tag/branch/commit or direct URL)
  * Any special configuration required to reproduce the issue
  * Step-by-step instructions to reproduce the issue
  * Proof-of-concept or exploit code (if possible)
  * Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

If you are reporting for a bug bounty, more complete reports can contribute to a higher bounty award. Please visit our [Microsoft Bug Bounty Program](https://microsoft.com/msrc/bounty) page for more details about our active programs.
