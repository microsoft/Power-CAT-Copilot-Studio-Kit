## Conversation KPIs

Conversation KPIs are designed to help makers track and analyze the performance of their custom agents. This feature complements the existing analytics built-in the Copilot Studio and simplifies the process of understanding conversation outcomes by providing aggregated data in Dataverse rather than requiring you to analyze the complex conversation transcripts. 

* Aggregated Data: The feature surfaces simplified conversation outcome results, making it easier to understand the performance of your custom agents. This includes metrics such as the number of sessions, turns, and the global outcome of conversations (e.g., resolved, partially resolved, escalated, or abandoned).

* Sample Power BI Reports: The Copilot Studio Kit offers a sample Power BI reports based on aggregated KPIs. These reports provide a visual representation of the data, helping you quickly identify trends and areas for improvement, and provide a solid starting point for your own custom reports.

* Tracked Variables: You can define specific variables to track as part of the aggregated conversation KPIs, such as custom Net Promoter Score (NPS) or other relevant metrics. This allows you to tailor the KPIs to your specific needs.

* Optional Full Transcript Storage: Users have the option to include the full conversation transcript with the KPI records (as file). This allows for a more detailed analysis if needed, using the transcript visualizer built into the Copilot Studio Kit.

* Long-term tracking: Conversation KPIs can be stored in the system for as long as required which allows tracking the impact of improvements and performance of custom copilots over long time-period.

Conversation KPIs are generated automatically twice per day and on-demand generation is supported as well. To generate KPIs on-demand, navigate to the agent configuration, press "**Generate KPIs**" and select a date range. Up to 75,000 transcripts are processed per automatic run and up to 50,000 per on-demand run. Please see [agent configuration](./CONFIGURE_COPILOTS.md) for more details on how to configure the Conversation KPIs.

![kpi report overview](https://github.com/user-attachments/assets/bca1bc9e-2d6f-42bc-a6b6-798003999f21)

![kpi details1](https://github.com/user-attachments/assets/96b48373-a7a0-4062-adb8-68bd97d22e12)
