# Power CAT Copilot Studio Kit

The **Power CAT Copilot Studio Kit** is a comprehensive set of capabilities designed to augment [Microsoft Copilot Studio](https://aka.ms/CopilotStudio). The kit helps makers develop and test custom agents, use large language model to validate AI-generated content, optimize prompts, and track aggregated key performance indicators of their custom agents.

![landingpage](https://github.com/user-attachments/assets/6b12168c-dab6-41e6-bcf9-64fb0802d931)

## Testing capabilities  
Copilot Studio Kit allows makers to configure agents, tests and test sets, and use them to batch test their custom agents. Test runs produce detailed results including latencies, observed responses and run level aggregates. Different test types include response match, attachment match, topic match and generative answers which leverages AI Builder for response analysis. 

More information on [testing capabilities](./TESTING_CAPABILITIES.md) 

## Conversation KPIs
Conversation KPIs are designed to help makers track and analyze the performance of their custom agents. This feature complements the existing analytics built-in the Copilot Studio and simplifies the process of understanding conversation outcomes by providing aggregated data in Dataverse rather than requiring you to analyze the complex conversation transcripts. 

More information on [conversation KPIs](./CONVERSATION_KPIS.md)

## SharePoint synchronization
SharePoint synchronization allows makers to configure periodical selective content synchronization from SharePoint locations to custom agent knowledge base as files.

More information on [SharePoint synchronization](./FILE_SYNCHRONIZATION.md)

## Prompt Advisor (preview)
Prompt Advisor allows makers to develop effective prompts while learning useful prompt engineering skills. Prompts entered in the advisor tool will be analyzed and receive a confidence evaluation with detailed reasoning for the score. Advisor also provides a list of suggested refined prompts implementing various prompt techniques. Makers can select from these optimized prompts to iteratively refine and improve their input.

More information on [Prompt Advisor](./PROMPT_ADVISOR.md)

# Setup instructions and documentation

- [Prerequisites](./PREREQUISITES.md)
- [Installation instructions](./INSTALLATION_INSTRUCTIONS.md)
- [Configure users and teams](/SETUP_USERS_AND_TEAMS.md)
- [Configure agents](./CONFIGURE_COPILOTS.md)
- [Configure tests](./CONFIGURE_TESTS.md)
- [Run tests](./RUN_TESTS.md)
- [Analyze test results](./ANALYZE_TEST_RESULTS.md)
- [Troubleshooting](./TROUBLESHOOT.md)

Optionally
- [Enable user authentication support](./ENABLE-AUTHENTICATION.md)
- [Enable Application Insights support](./ENABLE-APPINSIGHTS.md)

# Known limitations

As of the latest release:
- Multi-turn conversations are not yet supported.
- Authentication support for testing is limited to unauthenticated and authenticted with EntraV2 SSO.

## Latest release

The latest shipped version is available via **[Releases](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/releases)**. From there, you can download the latest version of all managed solutions that have been tested and are ready for use. 

Stay up to date with our releases by **subscribing** to them: 
1. Select **Watch**
2. Select **Custom** > **Releases** > **Apply** to receive notifications about our releases

# About this GitHub repo

The Power CAT Copilot Studio Kit GitHub Repo contains the source, releases, issues and backlog items of all components that are part of the Power CAT Copilot Studio Kit.

## Submit a feature request

Let us know by filing an issue. 
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
