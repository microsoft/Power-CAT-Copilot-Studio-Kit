## Conversation KPI

Conversation KPI are designed to help makers track and analyze the performance of their custom agents. This feature complements the existing analytics built-in the Copilot Studio and simplifies the process of understanding conversation outcomes by providing aggregated data in Dataverse rather than requiring you to analyze the complex conversation transcripts. 

* Aggregated Data: The feature surfaces simplified conversation outcome results, making it easier to understand the performance of your custom agents. This includes metrics such as the number of sessions, turns, and the global outcome of conversations (e.g., resolved, partially resolved, escalated, or abandoned).

* Sample Power BI Reports: The Copilot Agent Kit offers a sample Power BI reports based on aggregated KPIs. These reports provide a visual representation of the data, helping you quickly identify trends and areas for improvement, and provide a solid starting point for your own custom reports.

* Tracked Variables: You can define specific variables to track as part of the aggregated conversation KPI, such as custom Net Promoter Score (NPS) or other relevant metrics. This allows you to tailor the KPIs to your specific needs.

* Optional Full Transcript Storage: Users have the option to include the full conversation transcript with the KPI records (as file). This allows for a more detailed analysis if needed, using the transcript visualizer built into the Copilot Agent Kit.

* Long-term tracking: Conversation KPI can be stored in the system for as long as required which allows tracking the impact of improvements and performance of custom copilots over long time-period.

Conversation KPI are generated automatically twice per day and on-demand generation is supported as well. To generate KPIs on-demand, navigate to the agent configuration, press "**Generate KPIs**" and select a date range. Up to 75,000 transcripts are processed per automatic run and up to 50,000 per on-demand run. Please see [agent configuration](./CONFIGURE_COPILOTS.md) for more details on how to configure the Conversation KPI.
> **Important:** After Conversation KPI generation is completed, whether through the scheduled run or an on-demand **Generate KPIs** action, users must refresh the corresponding Power BI report in the Power BI service to load the latest available data. Until the dataset is refreshed, the report may continue to display previously loaded results and may not reflect the most recent KPI records generated in Dataverse.

![kpi report overview](https://github.com/user-attachments/assets/bca1bc9e-2d6f-42bc-a6b6-798003999f21)

![kpi details1](https://github.com/user-attachments/assets/96b48373-a7a0-4062-adb8-68bd97d22e12)

Read more on how to configure the agent for [KPI generation](./CONFIGURE_COPILOTS.md#configure-a-new-agent-for-conversation-kpis)

Conversation transcript generation has certain limitations, please study them carefully: https://learn.microsoft.com/microsoft-copilot-studio/analytics-transcripts-powerapps

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
