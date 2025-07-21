# Power CAT Copilot Studio Kit

The **Power CAT Copilot Studio Kit** is a comprehensive set of capabilities designed to augment [Microsoft Copilot Studio](https://aka.ms/CopilotStudio). The kit helps makers develop and test custom agents, use large language model to validate AI-generated content, optimize prompts, and track aggregated key performance indicators of their custom agents.

![kit_main](https://github.com/user-attachments/assets/d1e4db45-aa35-41df-b5f2-6737a320fdad)

# Features
## Testing capabilities  
Copilot Studio Kit allows makers to configure agents, tests and test sets, and use them to batch test their custom agents. Test runs produce detailed results including latencies, observed responses and run level aggregates. Different test types include response match, attachment match, topic match and generative answers which leverages AI Builder for response analysis. 

***Copilot Studio Kit test automation now supports multi-turn testing using all supported test types.***

More information on [testing capabilities](./TESTING_CAPABILITIES.md) 

## Conversation KPIs
Conversation KPIs are designed to help makers track and analyze the performance of their custom agents. This feature complements the existing analytics built-in the Copilot Studio and simplifies the process of understanding conversation outcomes by providing aggregated data in Dataverse rather than requiring you to analyze the complex conversation transcripts. 

More information on [conversation KPIs](./CONVERSATION_KPIS.md)

## SharePoint synchronization
SharePoint synchronization allows makers to configure periodical selective content synchronization from SharePoint locations to custom agent knowledge base as files.

More information on [SharePoint synchronization](./FILE_SYNCHRONIZATION.md)

## Prompt Advisor
Prompt Advisor allows makers to develop effective prompts while learning useful prompt engineering skills. Prompts entered in the advisor tool will be analyzed and receive a confidence evaluation with detailed reasoning for the score. Advisor also provides a list of suggested refined prompts implementing various prompt techniques. Makers can select from these optimized prompts to iteratively refine and improve their input.

More information on [Prompt Advisor](./PROMPT_ADVISOR.md)

## Webchat Playground
Webchat Playground simplifies customizing the appearance and behavior of the copilot agent webchat, including colors, fonts, thumbnails and initials. Easy to use UI allows makers to define the look and feel of their webchat, and HTML is generated with the specified styles. 

More information on [Webchat Playground](./WEBCHAT_PLAYGROUND.md)

## Adaptive Cards Gallery
Adaptive Cards Gallery provides makers with a dozen built-in adaptive card templates for different scenarios. They demonstrate the extensibility of the adaptive card visuals and behavior, and provide examples on the agent side implementation as well on things like dynamic data binding.

More information on [Adaptive Cards Gallery](./ADAPTIVE_CARDS_GALLERY.md)

## Agent Inventory (*New!*)
Agent Inventory provides administrators with a tenant-wide view to all Copilot Studio custom agents in their organization, including detailed information on the features they are using, authentication mode, knowledge sources, orchestration type and more. Agent Inventory ships with a dashboard and the data can be exported for use in other applications.

More information on [Agent Inventory](./AGENT_INVENTORY.md)

## Agent Review Tool (*New!*)
Agent Review Tool is a solution analysis tool that can be used to review your agents for any potential issues or anti-patterns that might have negative impact on the performance or the security of your agent. After analysing the solution, Agent Review Tool presents the findings in easy to interpret format, with severity and details on how to address the issue.

More information on [Agent Review Tool](./AGENT_REVIEW_TOOL.md)

## Conversation Analyzer (*New!*) (Preview)
Conversation Analyzer allows makers to analyze the conversations of their custom agents using custom prompts to get additional insights.

More information on [Conversation Analyzer](./CONVERSATION_ANALYZER.md)

## Agent Value Summary dashboard (*New!*) (Preview)

The Agent Value Component is a modular tool for classifying agents in Microsoft Copilot Studio by type, behavior, and value, helping organizations understand their role, align them with strategy, and measure their impact. Results are presented visually on Agent Value dashboard.

More information on [Agent Value dashboard](./AGENT_VALUE_SUMMARY_DASHBOARD.md)

## Automated testing using Power Platform Pipelines (*New!*) (Advanced)

This feature allows users to automate the testing and deployment of Copilot Studio custom agents using Power Platform Pipelines. The goal is to ensure that agents are automatically validated through test runs before they are deployed to target environments (production). By integrating Power Automate flows with Dataverse and the Copilot Studio Kit, this approach introduces a quality gate into the deployment process. Only agents that pass the required amount of test cases are allowed to proceed, ensuring higher reliability and reducing manual intervention. This method supports continuous delivery practices and enhances the overall governance of the deployment lifecycle.

More information on [automated testing using Power Platform Pipelines](./AUTOMATED_TESTING.md)

# Setup instructions and documentation

There is a Setup Wizard in the Kit which allows easy editing of connection references and environment variables as well as turning on cloud flows. After deploying the Kit from either AppSource or GitHub, you may access the Setup Wizard from the Home-page of the Copilot Studio Kit. Please see additional information [here](./SETUP_WIZARD.md).

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

For information on required licenses on Power Platform, and AI builder credits consumption, please see [Prerequisites](./PREREQUISITES.md)

# Known limitations

As of the latest release:
- Custom agent end user authentication support in test automation is limited Entra Id V2 with SSO.

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
