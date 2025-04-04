# Agent Review Tool
## Agent Review Tool overview

Agent Review Tool is a solution analysis tool that can be used to review your agents for any potential issues or anti-patterns that might have negative impact on the performance or the security of your agent. After analysing the solution, Agent Review Tool presents the findings in easy to interpret format, with severity and details on how to address the issue.

Agent Review Tool allows uploading a new solution package for analysis, or existing solution from the environment can be selected. The process starts by selecting "+ New Review" from the front page.

![agent review tool](https://github.com/user-attachments/assets/85525ff7-95d0-499d-a371-5ea8507d12af)

After selecting "+ New Review", the user can enter name for this review, description and pick the solution file. New solution can be uploaded  as well. After selecting the solution file, the analysis will start by pressing "Save". Processing the solution can several minutes depending on the size of the solution, after which user is presented with the results.

![agent review tool upload](https://github.com/user-attachments/assets/b31af6af-b16e-402e-8720-f310bb697587)

## Results

Agent Review Tool performs configuration analysis also for Power Apps and Power Automate components found in the solution, in addition to Copilot Studio custom agents. Results are presented in a format of a grouped list, and tabs can be used to filter findings to specific type. Each component is scored based on findings, lower score indicates higher amount of issues, anti-patterns and/or bad practices found in the component.

Individual findings can be reviewed by clicking "**Review**" next to the component.

![agent review tool results](https://github.com/user-attachments/assets/f4113a83-514b-492a-a0a4-8398e0f60816)

## Details for a component

In the detailed results view for a component, supported patterns and the analysis result are shown for each. Pie chart indicates the overall health for this specific component, with findings of different severity presented in a chart.

User can further drill down on the findings to learn more on the issue and how to resolve it.

![agent review tool findings](https://github.com/user-attachments/assets/704d9542-fa52-456b-850e-d6e5e924f791)

## Details for a pattern

Each pattern has a detailed description about the issue / bad practice / anti-pattern, information on how to address the issue, and often links to more documentation.

![agent review tool pattern](https://github.com/user-attachments/assets/6aa68579-1623-49f1-85e5-49b603bca6a7)

Performing periodical reviews helps the maker identify any changes that have been performed without following recommended and best practices , and could potentially have negative impact on the performance of the agent.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
