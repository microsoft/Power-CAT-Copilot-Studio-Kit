# Power CAT Copilot Studio Kit

The **Power CAT Copilot Studio Kit** is a comprehensive set of capabilities designed to augment [Microsoft Copilot Studio](https://aka.ms/CopilotStudio). The kit helps makers test custom agents, use large language model to validate AI-generated content, and track aggregated key performance indicators.

## Testing capabilities  
The Power CAT Copilot Studio Kit is a user-friendly application that empowers makers to configure agents and test sets. It has native capabilities such as Excel export or import for bulk creation and updates.

By running individual tests against the Copilot Studio APIs (Direct Line), the agent responses are evaluated against expected results.
To further enrich results, additional data points can be retrieved from Azure Application Insights and from Dataverse, by analyzing Conversation Transcript records (to get the exact triggered topic name, intent recognition scores, etc.).
For AI-generated answers, that are by nature non-deterministic, AI Builder prompts are used to compare the generated answer with a sample answer or with validation instructions.

Today, the tool supports these types of tests:
- Response exact match.
- Attachments match.
- Topic match (requires Dataverse enrichment)
- Generative answers (requires AI Builder for response analysis, and Azure Application Insights for details on why an answer was or was not generated)

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/33496e94-0c7a-4e63-9291-9e461aa9b9e7)

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/25f071ff-6b4f-4f5f-b6a3-20193a2d1feb)

## Conversation KPIs (Preview)

Conversation KPIs are designed to help makers track and analyze the performance of their custom agents. This feature complements the existing analytics built-in the Copilot Studio and simplifies the process of understanding conversation outcomes by providing aggregated data in Dataverse rather than requiring you to analyze the complex conversation transcripts. 

* Aggregated Data: The feature surfaces simplified conversation outcome results, making it easier to understand the performance of your custom agents. This includes metrics such as the number of sessions, turns, and the global outcome of conversations (e.g., resolved, partially resolved, escalated, or abandoned).

* Sample Power BI Reports: The Copilot Studio Kit offers a sample Power BI reports based on aggregated KPIs. These reports provide a visual representation of the data, helping you quickly identify trends and areas for improvement, and provide a solid starting point for your own custom reports.

* Tracked Variables: You can define specific variables to track as part of the aggregated conversation KPIs, such as custom Net Promoter Score (NPS) or other relevant metrics. This allows you to tailor the KPIs to your specific needs.

* Optional Full Transcript Storage: Users have the option to include the full conversation transcript with the KPI records (as file). This allows for a more detailed analysis if needed, using the transcript visualizer built into the Copilot Studio Kit.

* Long-term tracking: Conversation KPIs can be stored in the system for as long as required which allows tracking the impact of improvements and performance of custom copilots over long time-period.

Conversation KPIs feature is currently in preview and limited to processing 10000 transcripts per request. We recommend tracking less than 5 variables during the preview to avoid performance issues. Please see [agent configuration](./CONFIGURE_COPILOTS.md) for more details on how to configure the Conversation KPIs.

![kpi report overview](https://github.com/user-attachments/assets/bca1bc9e-2d6f-42bc-a6b6-798003999f21)

![kpi details1](https://github.com/user-attachments/assets/96b48373-a7a0-4062-adb8-68bd97d22e12)

## SharePoint synchronization

SharePoint synchronization allows makers to configure periodical selective content synchronization from SharePoint locations to custom agent knowledge base as files.

Benefits of using SharePoint synchronization (compared to using SharePoint site as knowledge source):
- Support for additional file types
- Support for larger files (up to 512MB)
- Lower latency in responses
- Indexing of non-text elements in PDFs

Please see [agent configuration](./CONFIGURE_COPILOTS.md) for more details and how to configure SharePoint synchronization.

# About this GitHub repo

The Power CAT Copilot Studio Kit GitHub Repo contains the source, releases, issues and backlog items of all components that are part of the Power CAT Copilot Studio Kit.

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
- Multi-turn conversations are not supported.

## Latest release

The latest shipped version is available via **[Releases](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/releases)**. From there, you can download the latest version of all managed solutions that have been tested and are ready for use. 

Stay up to date with our releases by **subscribing** to them: 
1. Select **Watch**
2. Select **Custom** > **Releases** > **Apply** to receive notifications about our releases

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
