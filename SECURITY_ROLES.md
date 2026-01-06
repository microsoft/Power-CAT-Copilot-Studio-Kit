# Security Roles

This document describes the security roles available in the Copilot Studio Kit (CSK) and their associated table permissions.

## Overview

The Copilot Studio Kit includes two primary security roles designed to support different user personas:

| Role                    | Description                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSK - Administrator** | Full administrative access to all CSK features. Intended for solution administrators who need to configure, manage, and maintain the entire Copilot Studio Kit. Administrators have Organization-level access to most tables, allowing them to view and manage all records across the organization.             |
| **CSK - Maker**         | Limited access designed for users who create and test agents. Makers typically have User-level access, allowing them to work with their own records while having read access to shared configuration data. This role is suitable for developers and testers who need to build and validate agent functionality. |

> [!NOTE]
> The following legacy security roles have been deprecated and should no longer be used. Please migrate users to the new **CSK - Administrator** or **CSK - Maker** roles:
>
> - Copilot Studio Kit - Administrator - Deprecated
> - Copilot Studio Kit - Configurator - Deprecated
> - Copilot Studio Kit - Tester/KPI Viewer - Deprecated

---

## Permission Types

| Permission    | Description                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create**    | Required to make a new record.                                                                                                                                                                                                                                                     |
| **Read**      | Required to open a record to view the contents.                                                                                                                                                                                                                                    |
| **Write**     | Required to make changes to a record.                                                                                                                                                                                                                                              |
| **Delete**    | Required to permanently remove a record.                                                                                                                                                                                                                                           |
| **Append**    | Required to associate the current record with another record; for example, if users have Append rights on a note, they can attach the note to an opportunity. For many-to-many relationships, a user must have Append privilege for both tables being associated or disassociated. |
| **Append To** | Required to associate a record with the current record; for example, if users have Append To rights on an opportunity, they can add a note to the opportunity.                                                                                                                     |
| **Assign**    | Required to give ownership of a record to another user.                                                                                                                                                                                                                            |
| **Share**     | Required to give access to a record to another user while keeping your own access.                                                                                                                                                                                                 |

### Permission Levels

| Level                            | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| **None**                         | No access to records in this table.                                         |
| **User**                         | Access only to records owned by the user.                                   |
| **Business Unit**                | Access to records owned by users in the same business unit.                 |
| **Parent: Child Business Units** | Access to records in the user's business unit and all child business units. |
| **Organization**                 | Access to all records in the organization regardless of ownership.          |

---

## Table Categories

| Category                       | Description                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Test Automation**            | Tables related to automated testing of agents, including test definitions, results, and deployment pipelines. |
| **Conversation KPI**           | Tables for tracking conversation metrics and agent transcripts for different KPIs analysis.                   |
| **Agent Inventory**            | Tables storing agent metadata, details, and usage statistics.                                                 |
| **Agent Compliance**           | Tables for compliance tracking and case management.                                                           |
| **Webchat Playground**         | Tables for webchat customization and styling.                                                                 |
| **Conversation Analyzer**      | Tables for analyzing conversations using custom prompts and configurations.                                   |
| **Adaptive Card Gallery**      | Tables for managing adaptive card templates used by agents.                                                   |
| **Agent Review Tool**          | Tables for reviewing Copilot Studio Agents, identifying patterns, and tracking review workflows.              |
| **SharePoint Synchronization** | Tables for configuring file indexing from SharePoint.                                                         |
| **Agent Value Summary**        | Tables for tracking agent value metrics.                                                                      |
| **Common**                     | Shared configuration tables used across multiple features.                                                    |
| **Unknown**                    | Tables with undefined or legacy purposes.                                                                     |

---

## CSK - Administrator Role

The Administrator role provides comprehensive access to manage all aspects of the Copilot Studio Kit.

**Legend:** 🟢 Organization | 🔵 User | 🚫 None

<table>
<tr>
<th>Category</th>
<th>Table Name</th>
<th>Create</th>
<th>Read</th>
<th>Write</th>
<th>Delete</th>
<th>Append</th>
<th>Append To</th>
<th>Assign</th>
<th>Share</th>
</tr>
<tr>
<td rowspan="7">Test Automation</td>
<td>Agent Test</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Set</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Run</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Result</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Rubric</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Rubric Example</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Deployment Pipeline Configuration</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="2">Conversation KPI</td>
<td>Agent Transcripts</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td>Conversation KPI</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td></td>
</tr>
<tr>
<td rowspan="2">Agent Inventory</td>
<td>Agent Details</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td>Agent Usage History</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td rowspan="2">Agent Compliance</td>
<td>Agent Compliance</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Compliance Case</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Webchat Playground</td>
<td>Chatbot Style</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="2">Conversation Analyzer</td>
<td>Conversation Analyzer</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td></td>
</tr>
<tr>
<td>Conversation Analyzer Prompt</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Adaptive Card Gallery</td>
<td>Agent Card</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="8">Agent Review Tool</td>
<td>Agent Review</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Agent Review Tool FRE</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Pattern Details</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Identifier</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Instance</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Result</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Solution Component</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Solution Review</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>SharePoint Synchronization</td>
<td>File Indexer Configuration</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Value Summary</td>
<td>Agent Value</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td rowspan="2">Common</td>
<td>Agent Configuration</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Copilot Studio Kit Logs</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td rowspan="3">Unknown</td>
<td>Agent Fact Row Counts</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Threshold Config</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Action Policy</td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
</tr>
</table>

---

## CSK - Maker Role

The Maker role provides access for users who build and test agents, with limited administrative capabilities.

**Legend:** 🟢 Organization | 🔵 User | 🚫 None

<table>
<tr>
<th>Category</th>
<th>Table Name</th>
<th>Create</th>
<th>Read</th>
<th>Write</th>
<th>Delete</th>
<th>Append</th>
<th>Append To</th>
<th>Assign</th>
<th>Share</th>
</tr>
<tr>
<td rowspan="7">Test Automation</td>
<td>Agent Test</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Set</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Run</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Test Result</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Rubric</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Rubric Example</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Deployment Pipeline Configuration</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="2">Conversation KPI</td>
<td>Agent Transcripts</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td>Conversation KPI</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td rowspan="2">Agent Inventory</td>
<td>Agent Details</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td>Agent Usage History</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td rowspan="2">Agent Compliance</td>
<td>Agent Compliance</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Compliance Case</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Webchat Playground</td>
<td>Chatbot Style</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="2">Conversation Analyzer</td>
<td>Conversation Analyzer</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td></td>
</tr>
<tr>
<td>Conversation Analyzer Prompt</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Adaptive Card Gallery</td>
<td>Agent Card</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td rowspan="8">Agent Review Tool</td>
<td>Agent Review</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
</tr>
<tr>
<td>Agent Review Tool FRE</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Pattern Details</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Identifier</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Instance</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🚫</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Pattern Result</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Solution Component</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Solution Review</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>SharePoint Synchronization</td>
<td>File Indexer Configuration</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Agent Value Summary</td>
<td>Agent Value</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td rowspan="2">Common</td>
<td>Agent Configuration</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🟢</td>
<td>🟢</td>
</tr>
<tr>
<td>Copilot Studio Kit Logs</td>
<td>🔵</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🔵</td>
<td>🔵</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td rowspan="3">Unknown</td>
<td>Agent Fact Row Counts</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Threshold Config</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
<td>🚫</td>
</tr>
<tr>
<td>Action Policy</td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
</tr>
</table>

---

## Key Differences Between Roles

| Feature Area              | Administrator                                       | Maker                                                                  |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| **Test Automation**       | Full Organization access                            | Full access except User-level for Test Results                         |
| **Conversation KPI**      | Full Organization access                            | No access                                                              |
| **Agent Inventory**       | Full Organization access                            | No access                                                              |
| **Agent Compliance**      | Organization access (except Compliance Case)        | No access                                                              |
| **Conversation Analyzer** | Full Organization access                            | No access                                                              |
| **Agent Review Tool**     | Mixed (User for reviews, Organization for patterns) | Mixed (User for reviews, Organization for patterns, no Delete on some) |
| **SharePoint Sync**       | Organization access                                 | User-level access                                                      |
| **Agent Value Summary**   | Organization access                                 | No access                                                              |
| **Common Tables**         | Organization access                                 | User-level access                                                      |

---

## Related Resources

- [Microsoft Dataverse Security Concepts](https://docs.microsoft.com/en-us/power-platform/admin/wp-security-cds)
- [Security Roles and Privileges](https://docs.microsoft.com/en-us/power-platform/admin/security-roles-privileges)
