# Conversation Analyzer (Preview)

Conversation analyzer allows makers to analyze the conversation transcripts of their Copilot Studio custom agents using custom prompts. The feature comes with two pre-canned prompts, sentiment analysis and PII analysis. Custom prompts can be created, used, saved and reused later. Using custom prompts to analyze the conversations can provide insights not available through traditional analytics.

## Conversation Analyzer overview

After navigating to the conversation analyzer feature, a list of agents is shown. Conversation Analyzer uses the agent data in the Agent Inventory, so it must be populated first before using conversation analyzer.

The list of agents has "Action" column that has either "Analyze" or "View Results" hyperlink in it. "View Results" indicates that the recent transcripts have already been analyzed and can be viewed.

"Analyze" indicates that no analysis exists and recent transcripts for the agent can be selected for analysis.

<img width="1920" height="937" alt="overview" src="https://github.com/user-attachments/assets/ba6d5b07-8592-4275-8657-4c561156944f" />

## Creating new analysis

After selecting an agent and clicking "Analyze" from the action, prompt selection screen is shown. The feature ships with two precanned prompts, "Sentiment Analysis" and "PII Analysis".

![Copilot Studio Kit - New Analysis](https://github.com/user-attachments/assets/50aed206-b3d5-4a30-a464-4a6696d437e4)


The primary purpose of the feature is to allow makers to use custom prompts to analyze the conversations with. To create a new custom prompt or updating an existing custom prompt, go to the **Manage Prompts** page, enter a descriptive name in the Prompt Name field, and add your prompt text in the **Prompt** textbox.

![Copilot Studio Kit - Manage Prompts](https://github.com/user-attachments/assets/86707fda-3291-4512-9d8e-5594667f3536)

![Copilot Studio Kit - Manage Prompts - Edit](https://github.com/user-attachments/assets/27718f22-4ae1-4498-93d8-66c75cfeb0fe)


Once the custom prompt is saved, it becomes available for future use in the prompt selection dropdown list.

When the analysis is started, it will take a moment to process. After the processing is finished, results will be presented.

## Viewing existing analysis

If "View Results" is selected from the agent selections screen, analysis results are shown. Same view is presented after successful (new) analysis has completed.

<img width="1921" height="1147" alt="analysis_ready" src="https://github.com/user-attachments/assets/055c6343-2a43-40c0-ab21-8149afa5c800" />

Conversation Id, summary of the conversation, duration of the conversation, prompt used and analysis creation date are shown. Depending on the prompt, the summary may already provide valuable insights. Conversation and analysis details can be shown by pressing "View Results" from the "Action" column.

## Conversation analysis details

Conversation analysis details view varies slightly depending on the prompt used. The conversation can be seen on the right side of the screen as it happened, and analysis details are shown in the main view.

<img width="1919" height="1145" alt="results_details" src="https://github.com/user-attachments/assets/dc3ccbef-7ee1-462b-9aa4-4520ecfb6663" />

This feature is experimental and the team is looking forward to hearing feedback from users.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
