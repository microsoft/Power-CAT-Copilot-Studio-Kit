# Automated testing and deployment of Copilot Studio agents using Power Platform Pipelines

## Overview

This feature allows users to automate the testing and deployment of Copilot Studio custom agents using Power Platform Pipelines. The goal is to ensure that agents are automatically validated through test runs before they are deployed to target environments (production). By integrating Power Automate flows with Dataverse and the Copilot Studio Kit, this approach introduces a quality gate into the deployment process. Only agents that pass the required amount of test cases are allowed to proceed, ensuring higher reliability and reducing manual intervention. This method supports continuous delivery practices and enhances the overall governance of the deployment lifecycle .

## What it allows users to do

*Automated Validation*: Automatically validate agent functionality through test runs before deployment.

*Quality Gate*: Ensure only agents that pass the required amount of test cases proceed to deployment, enhancing reliability.

*Continuous Delivery*: Support continuous delivery practices by integrating automated testing into the deployment lifecycle.

*Governed Deployment*: Enforce governance and control over the deployment process, reducing manual steps and errors.

## Requirements

*Pipeline Host Environment*: The central control point for the deployment process.

*Development (Source) Environment*: Where the Copilot Studio agent is developed and tested.

*Target (Prod) Environment*: The final destination for deployment, where the agent is published after passing all validation checks.

## High-Level Steps

- Open the Deployment Pipeline Configuration App: Launch the app from the Power Apps portal to create and manage deployment pipelines.
- Configure the Pipeline: Provide a pipeline name and link development environments.
- Configure Deployment Stages: Add deployment stages to define target environments and enable pre-export and pre-deployment steps.
- Trigger on Deployment Request: The flow is triggered when a deployment request is initiated for a solution that includes a Copilot Studio Agent.
- Run Automated Tests: The flow pauses the deployment, runs automated tests, evaluates test results, and decides whether to proceed with deployment based on the test outcomes.

## Detailed documentation

[Automated Testing and Deployment of Copilot Studio Agents Overview](https://github.com/user-attachments/files/21301068/Automated.Testing.and.Deployment.of.Copilot.Studio.Agents.Overview.pdf)

 
