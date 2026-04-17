# Conversation Analyzer (Preview)

Conversation analyzer allows makers to analyze the conversation transcripts of their Copilot Studio custom agents using custom prompts. The feature comes with two pre-canned prompts, sentiment analysis and PII analysis. Custom prompts can be created, used, saved and reused later. Using custom prompts to analyze the conversations can provide insights not available through traditional analytics.

## Conversation Analyzer overview
After navigating to the conversation analyzer feature, a list of agents is shown. Conversation Analyzer uses the agent data in the Agent Inventory, so it must be populated first before using conversation analyzer.

## Technical Details

### Canvas App

| Display Name | Logical Name |
|---|---|
| Conversation Analyser | `cat_conversationanalyser` |

### Cloud Flows

| Flow Name | Purpose |
|---|---|
| Conversation Analyzer \| Analyze Conversation Based on Prompt | Runs the selected prompt against a conversation transcript using AI Builder |
| Conversation Analyzer \| Get the Conversation Transcript | Retrieves the conversation transcript from Copilot Studio for analysis |

### Connection References

| Connection Reference | Required |
|---|---|
| Copilot Studio Kit - Dataverse | Yes |

### Environment Variables

None specific to this feature.

### Dataverse Tables

| Display Name | Logical Name | Notes |
|---|---|---|
| Conversation Analyzer | `cat_ConversationAnalyzer` | Stores analysis results |
| Conversation Analyzer Prompt | `cat_ConversationAnalyzerPrompt` | Stores built-in and custom prompts |
| Agent Details | `cat_AgentDetails` | **Dependency** — requires Agent Inventory to be populated before use |

### Prerequisites

- **Agent Inventory** must be populated first. Conversation Analyzer reads agent data from the Agent Inventory tables; analysis cannot run without it.
- **AI Builder credits** are required for prompt-based analysis.

### DLP Connectors

| Connector |
|---|
| Microsoft Dataverse |

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
