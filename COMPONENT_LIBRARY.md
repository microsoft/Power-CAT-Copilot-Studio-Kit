Components for quick Copilot Studio agents (Draft)

# Copilot Studio Kit Component Library

The Component Library provides a set of reusable, pre-built components for Microsoft Copilot Studio. Each component is packaged as its own [component collection](https://learn.microsoft.com/microsoft-copilot-studio/authoring-export-import-copilot-components), so you can install only the components you need. Import the solution into your environment, add the component collections you want to your agent, and use your agent’s instructions to tell the agent how to use them, or directly reference the prompts and flows to enhance your topic.

> [!NOTE]
> The Component Library is available as both a managed and an unmanaged solution. Use the **managed** solution to [add components to your agents](#using-components-with-a-managed-solution) without modification. Use the **unmanaged** solution only if you need to [edit component internals](#customizing-components-with-an-unmanaged-solution).

## Overview

The Component Library includes six components that span data acquisition, data analysis, content generation, and system integration. For installation instructions, see [Step-by-step setup](#step-by-step-setup).

| **Collection** | **Internal name** | **Components** | **Connections** |
| --- | --- | --- | --- |
| [Document Extraction Component](#document-extraction) | cat_DocExtract | 1 prompt | Dataverse |
| [Research Component](#research-component) | cat_Research | 1 topic + 3 prompts (Stage 2 → Content Synthesis Module) | Dataverse |
| [Content Synthesis Component](#content-synthesis-component) | cat_ContentSynthesis | 1 prompt (shared Stage 2) | Dataverse |
| [Executive Brief Component](#executive-brief-generator) | cat_ExecBrief | 1 topic + 3 prompts (Stage 2 → Content Synthesis Module) | Dataverse |
| [ServiceNow Ticket Component](#servicenow-ticket-assistant) | cat_ServiceNowTicket | 5 topics + 1 connection Ref | Dataverse, ServiceNow |
| [Word Document Component](#generate-word-document) | cat_WordDoc | 1 agent flow + 1 connection Ref | Dataverse, OneDrive/SharePoint |

## Prerequisites

Before you install the Component Library, make sure you have:

*   A Power Platform environment with Copilot Studio enabled
*   AI Builder credits available in your environment (required for prompt-based components)
*   For the ServiceNow Ticket Assistant: a ServiceNow instance with API access configured

## Available components

> [!IMPORTANT]  
> Fields marked "No" for Required have built-in defaults and work without configuration. Provide a value only to override the default behavior.

### Document Extraction

| **Type** | AI Builder Prompt (TaskDialog) |
| --- | --- |
| **Category** | Data Acquisition & Integration |
| **Interaction model** | Tool-initiated — the agent orchestrator invokes this tool when the user's intent matches the tool description. |

Transforms uploaded documents into structured data. Uses an AI Builder prompt to parse and extract key fields based on a configurable schema.

**When to use:** Invoice processing, contract review, form digitization, or any scenario that requires pulling structured information from unstructured documents.

#### How it works

1.  The user uploads a document to the agent conversation.
2.  The component processes the document with AI Builder.
3.  Extracted data is returned as structured output that can be stored, displayed, or passed to downstream flows.

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| DocumentContent | Document Content | Yes | The content of the document to extract data from |
| DocumentType | Document Type | No | The type of document (for example, invoice, contract, form) |
| ExtractionSchema | Extraction Schema | No | The schema or fields to extract from the document |
| Language | Language | No | The language of the document |
| AdditionalInstructions | Additional Instructions | No | Additional extraction instructions or constraints |

#### Outputs

All AI Builder prompt outputs are returned.

### Research Component

| Type | Topic + 3 AI Builder Prompts + Web Search |
| --- | --- |
| Category | Data Analysis & Insight |
| Interaction model | Tool-initiated — 3-stage pipeline: research planning → content synthesis → report finalization. Automatically generates a downloadable Word document. |

Synthesizes information from multiple sources into a comprehensive research report. Uses a 3-stage AI pipeline to plan, research, and compile findings, then generates a downloadable Word document.

**When to use:** Competitive analysis, market research, policy review, or any scenario that requires a consolidated view across multiple information sources.

#### How it works

1.  The user provides a research question or topic.
2.  Stage 1 — Research Planner: Creates a structured research plan with sections and queries.
3.  Stage 2 — Content Synthesizer: Searches web sources for each section and generates content with citations.
4.  Stage 3 — Report Finalizer: Combines all sections and citations into a polished report.
5.  The final report is displayed inline and a Word document is generated for download.

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| ResearchPrompt | Research Prompt | Yes | The main topic or subject to research (for example, "Overview of electric vehicle market") |
| AdditionalInstructions | Additional Instructions | No | Optional context such as focus areas or constraints. Defaults to "Begin with clear research objective" if empty. |
| InstructionsForContentSynthesizer | Instructions For Content Synthesizer | No | Controls the style and length of each section. Defaults to "Simple style, 200 words max" if empty. |
| InstructionsForReportFinalizer | Instructions For Report Finalizer | No | Controls how the final report is assembled. Defaults to synthesizing all sections into a cohesive report. |

#### Outputs

The component displays the report inline in the conversation and generates a downloadable Word document via the Generate Word Document subtopic.

### Content Synthesis Component

| **Type** | AI Builder Prompt |
| --- | --- |
| **Category** | Data analysis & Insight |
| **Interaction model** | Tool-initiated — the agent orchestrator invokes this tool when the user’s intent matches the tool description. Also serves as the shared Stage 2 step for the Research Component and Executive Brief Generator. |

Transforms research context into evidence-based, citation-rich content sections. Uses a three-phase process — information assessment, content development, and quality enhancement — to produce structured markdown with numbered inline citations.

The component powers Stage 2 of both the [Research Module](https://file+.vscode-resource.vscode-cdn.net/c%3A/Users/demora/.copilot/session-state/09965f42-4e60-4169-8d31-4fde4b327ba9/files/learn-doc-component-library.md#research-module) and [Executive Brief Module](https://file+.vscode-resource.vscode-cdn.net/c%3A/Users/demora/.copilot/session-state/09965f42-4e60-4169-8d31-4fde4b327ba9/files/learn-doc-component-library.md#executive-brief-module) pipelines, and also works as a standalone general-purpose synthesis tool.

**When to use:** Any scenario that requires turning source material into a polished, citation-backed content section — research reports, executive briefs, competitive analyses, policy reviews, or standalone topic summaries.

#### **How it works:**

1.  **Phase 1 — Information assessment:** Evaluates source credibility and recency, identifies well-covered vs. sparse areas, detects contradictions, maps gaps, and identifies potential biases.
2.  **Phase 2 — Content development:** Structures findings into themed sections using a 4-layer analysis framework (What → So What → Now What → What If), with an opening insight, evidence-based body, and synthesized closing.
3.  **Phase 3 — Quality enhancement:** Applies confidence-appropriate language, verifies every claim against provided sources, and adds intellectual honesty markers for limitations, methodology notes, and gaps.

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| Research_Prompt | Research Prompt | Yes | The original research question or topic that provides overall context. Also used to infer writing style, audience, and domain when Additional_Instructions is not provided. |
| Section_Data | Section Data | Yes | The section assignment to synthesize. Accepts structured JSON (with section_id, section_title, section_focus, priority, expected_outputs, potential_gaps) or plain text. When plain text is provided, the component extracts the section title and focus automatically. |
| Context | Context | Yes | The research source material, formatted as search results with **Title:**, **Source:**, and **Content:** blocks. This is the component's **only** source of information — it never fabricates data beyond what is provided. All Title–Source pairs are automatically extracted into the citations array. |
| Additional_Instructions | Additional Instructions | No | Optional overrides for writing style, target audience, technical depth, target length, citation preferences, visualization needs, and confidence assessment. When omitted, the component infers optimal settings from the research prompt and section data. |

#### Outputs

| **Name** | **Description** |
| --- | --- |
| section_content_markdown | The synthesized section content in markdown format, including themed subsections, key findings, data tables, chart suggestions, and a confidence assessment footer. All claims include numbered citation markers [n]. |
| citations | A JSON array of source references in "Title - URL" format, extracted from the Context input. The array index (1-based) determines the [n] numbering used in the section content. Returns an empty array when no Context is provided. |

Intelligent defaults

When Additional\_Instructions is omitted, the component infers settings from the research prompt and section data:

| Setting | How it's inferred |
| --- | --- |
| **Writing style** | Executive (business/market keywords), Academic (study/research keywords), Technical (architecture/implementation keywords), or Consultative (default) |
| **Target audience** | C-suite, Technical, Expert, or Informed (default) |
| **Technical depth** | General ("high-level"/"overview"), Informed (default), or Expert ("technical"/"detailed") |
| **Section length** | Based on&nbsp;priority&nbsp;in Section_Data: Critical (600–800 words), High (500–700), Medium (400–600), Low (300–500) |
| **Citation style** | Numbered&nbsp;[n]&nbsp;markers placed at the end of the sentence or paragraph referencing each source |
| **Confidence assessment** | Included by default; set "skip confidence" or "no metadata" in Additional_Instructions to omit |

#### Domain-specific adaptations

The component adjusts its analytical framework based on the domain of the research prompt:

| **Domain** | **Focus areas** |
| --- | --- |
| Healthcare / Medical | Efficacy, safety, cost-effectiveness, study design, regulatory status |
| Business / Finance | Market context, competitive dynamics, financial implications, stakeholder perspectives |
| Technology / Engineering | Scalability, performance, security, implementation challenges, interoperability |
| Policy / Government | Stakeholder perspectives, implementation feasibility, cost and equity implications |

**Tip:** For standalone use, add the Content Synthesis Component collection to any agent and provide source material through the Context input. No other components are required. For detailed documentation, see [Content Synthesis Component](https://file+.vscode-resource.vscode-cdn.net/c%3A/Users/demora/.copilot/session-state/09965f42-4e60-4169-8d31-4fde4b327ba9/files/kit-content-synthesis-component).

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| FileName | File Name | Yes | Name of the output file |
| ReportContent | Report Content | Yes | The markdown content to save as a Word document |

#### Outputs

| **Name** | **Display name** | **Description** |
| --- | --- | --- |
| ReportFileLink | Report File Link | Download URL for the generated Word document |

### Executive Brief Generator

| **Type** | Topic + 3 AI Builder Prompts + Internal/Web Search |
| --- | --- |
| **Category** | Content Generation & Transformation |
| **Interaction model** | Tool-initiated — 3-stage pipeline: strategic planning → insight synthesis → brief finalization. Automatically generates a downloadable Word document. |

Generates concise, decision-oriented summaries from complex inputs. Uses a 3-stage AI pipeline to plan, synthesize insights, and compile a polished executive brief with a downloadable Word document.

**When to use:** Board meeting preparation, project status updates, quarterly business reviews, or any scenario that requires a polished summary for stakeholders.

#### How it works

1.  The user provides a brief topic or question.
2.  Stage 1 — Executive Brief Planner: Creates a strategic research plan with research areas.
3.  Stage 2 — Insight Synthesizer: Searches internal and web sources for each area, extracts key facts and citations.
4.  Stage 3 — Brief Finalizer: Compiles all insights and citations into a polished executive brief.
5.  The brief is displayed inline and a Word document is generated for download.

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| ResearchPrompt | Research Prompt | Yes | The brief topic or question (for example, "AI adoption strategy for mid-market companies") |
| AdditionalInstructions | Additional Instructions | No | Optional company context, focus areas, or constraints |

#### Outputs

The component displays the executive brief inline in the conversation and generates a downloadable Word document via the Generate Word Document subtopic.

### ServiceNow Ticket Assistant

| **Type** | 5 topics + ServiceNow connector + adaptive cards |
| --- | --- |
| **Category** | Action execution and system integration |
| **Interaction model** | Conversation-initiated — the agent routes to the appropriate topic based on user intent. Each topic uses adaptive cards to collect required fields. |

Provides end-to-end ServiceNow incident management directly from a Copilot Studio agent. Includes five topics that cover the full incident lifecycle.

#### Included topics

| **Topic** | **Description** |
| --- | --- |
| Create Incident | Collects short description, detailed description, impact, and urgency via adaptive card, then creates the incident in ServiceNow. |
| Check Status | Accepts an incident number (for example, INC0010002) and returns state, priority, dates, and description. |
| Resolve/Close Incident | Updates an incident's state (Resolved, Closed, Canceled, On Hold, In Progress) with resolution code and notes. |
| Get Recent Incidents | Automatically retrieves up to 10 recent incidents for the signed-in user (no input required). |
| Next Actions | Displays a navigation menu after completing a ServiceNow operation, routing to other ServiceNow topics or general conversation. |

**Note:** ServiceNow topics use adaptive cards to collect user input directly in the conversation. No tool-level inputs are required.

**When to use:** IT help desk, employee self-service, or any scenario that involves ServiceNow incident management.

#### Additional prerequisites

*   ServiceNow instance with REST API access
*   A connection configured in Power Platform for ServiceNow
*   Appropriate ServiceNow user permissions for the operations needed

#### Service principle setup

To set up a ServiceNow Power Platform connection that uses Microsoft Entra ID, follow the steps documented here: [How to set up a ServiceNow Power Platform connection that uses Microsoft Entra ID](https://learn.microsoft.com/en-us/connectors/service-now/#how-to-set-up-a-servicenow-power-platform-connection-that-uses-microsoft-entra-id)

#### How it works

1.  The user expresses an intent (for example, "I need to create a ticket" or "What's the status of INC0012345?").
2.  The appropriate topic is triggered and presents an adaptive card to collect the required inputs.
3.  The component calls the ServiceNow API via a connector and returns the result.
4.  After completing the operation, the Next Actions topic presents options for the next step.

#### ServiceNow: Create Incident

| **Type** | Topic + ServiceNow Connector + Adaptive Cards |
| --- | --- |
| **Category** | Action Execution & System Integration |
| **Interaction model** | Conversation-initiated — the agent routes to this topic based on user intent. An Adaptive Card collects the required fields. |

Creates a new ServiceNow incident by collecting details from the user and submitting them to ServiceNow via a connector.

**When to use**: IT help desk, employee self-service, or any scenario where users need to log new incidents directly from conversation.

##### How it works

1.  The user expresses an intent to create an incident (e.g., "I need to create a ticket for a broken laptop").
2.  An Adaptive Card collects the required incident details.
3.  The component calls the ServiceNow API to create the incident and returns a confirmation with the incident number.
4.  A Next Actions menu is presented so the user can continue with another ServiceNow operation.

##### Prerequisites

##### Inputs (via adaptive card)

| **Field** | **Required** | **Description** |
| --- | --- | --- |
| ShortDescription | Yes | Brief summary of the issue |
| Description | No | Detailed description of the problem |
| Impact | Yes | Business impact level (1-High, 2-Medium, 3-Low) |
| Urgency | Yes | Urgency level (1-High, 2-Medium, 3-Low) |

##### Outputs

Confirmation message with the created incident number displayed inline.

#### ServiceNow: Check Incident Status

| **Type** | Topic + ServiceNow Connector + Adaptive Cards |
| --- | --- |
| **Category** | Action Execution & System Integration |
| **Interaction model** | Conversation-initiated — the agent routes to this topic based on user intent. An Adaptive Card collects the incident number. |

Retrieves the latest status and details of an existing ServiceNow incident.

##### How it works

1.  The user asks about an incident (e.g., "What's the status of INC0010002?").
2.  An Adaptive Card collects the incident number.
3.  The component queries ServiceNow and returns the incident details.

##### Prerequisites

##### Inputs (via adaptive card)

| **Field** | **Required** | **Description** |
| --- | --- | --- |
| IncidentNumber | Yes | The incident number to look up (e.g., INC0010002) |

##### Outputs

| **Field** | **Description** |
| --- | --- |
| IncidentNumber | The incident identifier |
| State | Current state of the incident |
| Priority | Priority level |
| CreatedDate | When the incident was created |
| LastUpdatedDate | Incident description |

#### ServiceNow: Resolve/Close Incident

| **Type** | Topic + ServiceNow Connector + Adaptive Cards |
| --- | --- |
| **Category** | Action Execution & System Integration |
| **Interaction model** | Conversation-initiated — the agent routes to this topic based on user intent. An Adaptive Card collects the resolution details. |

Updates an existing ServiceNow incident's state to Resolved, Closed, Canceled, On Hold, or In Progress, along with resolution details.

##### How it works

1.  The user expresses an intent to resolve or close an incident (e.g., "Close ticket INC0010002").
2.  An Adaptive Card collects the incident number, target state, resolution code, and resolution notes.
3.  The component updates the incident in ServiceNow and returns a confirmation.

##### Prerequisites

ServiceNow instance with REST API access and a ServiceNow connection in Power Platform.

##### Inputs (via adaptive card)

| **Field** | **Required** | **Description** |
| --- | --- | --- |
| IncidentNumber | Yes | The incident number to update |
| State | Yes | Target state (Resolved, Closed, Canceled, On Hold, In Progress) |
| ResolutionCode | Yes | Resolution category (Solved Remotely, Solved by Caller, etc.) |
| Resolution Notes | Yes | Description of the resolution |

##### Outputs

Confirmation message with the updated incident state displayed inline.

#### ServiceNow: Get Recent Incidents

| **Type** | Topic + ServiceNow Connector |
| --- | --- |
| **Category** | Action Execution & System Integration |
| **Interaction model** | Conversation-initiated — the agent routes to this topic based on user intent. No user input is required; the component automatically uses the signed-in user's identity. |

Retrieves and displays up to 10 recent ServiceNow incidents for the current user. No input fields are needed — the component uses the signed-in user's email automatically.

##### **When to use:** When users want a quick overview of their recent or open incidents.

**How it works**

1.  The user asks about their incidents (e.g., "Show my recent incidents").
2.  The component queries ServiceNow for up to 10 recent incidents matching the signed-in user's email.
3.  Incident details are displayed inline in the conversation.

##### Prerequisites

##### Inputs

None — automatically uses the signed-in user's email.

##### Outputs

| **Field** | **Description** |
| --- | --- |
| Incident Number | The incident identifier |
| State | Current state of the incident |
| Priority | Priority level |
| ShortDescription | Brief summary of the issue |
| CreatedDate | When the incident was created |
| LastUpdatedDate | When the incident was last modified |

**Note:** All ServiceNow components include a **Next Actions** navigation menu that appears after each operation, allowing the user to quickly move to another ServiceNow action or return to general conversation.

### Generate Word Document

| **Type** | Agent flow |
| --- | --- |
| **Category** | Content transformation |
| **Interaction model** | Tool-initiated — can also be called as a subtopic by other components (Research, Executive Brief). |

Converts text from an agent conversation into a Microsoft Word document (.docx) and returns a download link directly in the session. Also used automatically by the Research Component and Executive Brief Generator to produce their final output documents.

**When to use:** Report generation, meeting notes export, policy document creation, or any scenario that requires a formatted, downloadable document from conversational input.

#### How it works

This component requires Power Automate and access to OneDrive or SharePoint (depending on your flow configuration).

1.  The user provides or generates text content within the agent conversation.
2.  The Power Automate cloud flow creates a Word document from the text.
3.  A download link is returned in the conversation for the user to retrieve the document.

#### Inputs

| **Name** | **Display name** | **Required** | **Description** |
| --- | --- | --- | --- |
| FileName | File Name | Yes | Name of the output file |
| ReportContent | Report Content | Yes | The markdown content to save as a Word document |

#### Outputs

| **Name** | **Display name** | **Description** |
| --- | --- | --- |
| ReportFileLink | Report File Link | Download URL for the generated Word document |

## Step-by-step setup

Setting up a component involves three phases: import the solution, add the component to your agent, and test and publish.

For general guidance on solutions, see [Create and manage solutions in Copilot Studio](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-overview). For component collections, see [Create and share reusable component collections](https://learn.microsoft.com/microsoft-copilot-studio/authoring-export-import-copilot-components).

### Phase 1: Import the Component Library solution

The Component Library solution contains all six components. You only need to import the solution once. After import, you choose which individual component collections to add to your agent.

#### Step 1 — Download the solution

1.  Go to the [latest release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/latest) on GitHub.
2.  Under Assets, download the Component Library .zip file (for example, CopilotStudioKit\_ComponentLibrary\_managed.zip).
3.  Save the file to your local machine. Do not unzip it.

#### Step 2 — Import the solution into your environment

For detailed steps on importing solutions, see [Export and import agents using solutions](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-import-export).

1.  Go to [make.powerapps.com](https://make.powerapps.com/).
2.  In the top-right corner, verify you are in the correct environment where your Copilot Studio agent lives. Use the environment picker to switch if needed.
3.  In the left navigation, select Solutions.
4.  Select Import solution from the top command bar.
5.  Select Browse, then choose the .zip file you downloaded.
6.  Select Next.
7.  Review the solution details (name, publisher, version). Select Next again.

#### Step 3 — Configure connections during import

During import, you're prompted to set up connections for the components. Each connector used by the components requires an active connection. You only need to configure connections for the components you plan to use.

1.  For each connection reference listed, select Select a connection or New connection:
    *   Dataverse — Required for most components.
    *   AI Builder — Required for prompt-based components (Document Extraction, Filter & Summarize Rows, Research, Executive Brief).
    *   ServiceNow — Required only for the ServiceNow Ticket Assistant. You need your ServiceNow instance URL and credentials with API access.
    *   OneDrive / SharePoint — Required for Text to Word Document.
2.  After configuring all connections, select Import.
3.  Wait for the import to complete. This may take a few minutes. A green banner confirms success.

**Tip:** If the import fails, select Download log file to see what went wrong. The most common cause is a missing connection or insufficient permissions.

#### Step 4 — Enable cloud flows

Some components include Power Automate cloud flows (for example, Text to Word Document and Document Extraction advanced). These must be turned on after import.

1.  In [make.powerapps.com](https://make.powerapps.com/), go to Solutions.
2.  Open the Component Library solution you just imported.
3.  In the left pane, select Cloud flows.
4.  For each flow that shows Status = Off, select the flow name, then select Turn on from the top command bar.

### Phase 2: Add components to your agent

**Important:**

After you import the solution, the components exist in your environment but are not automatically connected to your agent. Each component is packaged as its own component collection, so you can add only the ones you need.

For more details, see [Add imported component collections to your agent](https://learn.microsoft.com/microsoft-copilot-studio/authoring-export-import-copilot-components#add-imported-component-collections-to-your-agent).

#### Add a component collection to your agent

Repeat these steps for each component you want to use:

1.  Open [Copilot Studio](https://copilotstudio.microsoft.com/).
2.  Select Agents, then open the agent you want to add the component to.
3.  Select Settings (gear icon) in the top bar.
4.  In the left menu, select Component collections.
5.  Find the component collection you want to add (for example, "Document Extraction" or "Research Component").
6.  Select the three dots (…) next to the collection name, then select Add to agent.
7.  Confirm by selecting Add to agent in the dialog.
8.  Your agent name now appears under Active for next to the collection.

After you add a collection, the topics and tools for that component are available in your agent.

#### Available component collections

| **Component collection** | **What it adds** | **Connections required** |
| --- | --- | --- |
| Document Extraction (basic) | AI Builder prompt | Dataverse, AI Builder |
| Document Extraction (advanced) | Agent Flow | Dataverse |
| Research Component | Topic + AI Builder prompt | Dataverse, AI Builder |
| Filter & Summarize Rows | AI Builder prompt | Dataverse, AI Builder |
| Executive Brief Generator | Topic + AI Builder prompt | Dataverse, AI Builder |
| ServiceNow Ticket Assistant | 4 topics + connector | Dataverse, ServiceNow |
| Text to Word Document | Agent Flow | Dataverse, OneDrive/SharePoint |

### Phase 3: Test and publish

#### Step 1 — Test in the test pane

1.  In Copilot Studio, select Test your agent (in the top-right corner).
2.  Enter a natural-language prompt for each component you added. For example:
    *   _"Extract data from this invoice"_ — triggers Document Extraction
    *   _"Research the latest trends in renewable energy"_ — triggers the Research component
    *   _"Summarize the top 10 rows in my sales table"_ — triggers Filter & Summarize Rows
    *   _"Create an executive brief for the Q4 results"_ — triggers Executive Brief Generator
    *   _"Create a ServiceNow ticket for a broken laptop"_ — triggers ServiceNow Create Incident
    *   _"Generate a Word document from this text"_ — triggers Text to Word Document
3.  Verify that the agent routes to the correct topic or tool, that connections work, and that the output is correct.

**Tip:** If the agent doesn't trigger the correct component, open the component's tool configuration and update the Description field. The orchestrator uses this description to determine when to invoke each tool.

#### Step 2 — Publish your agent

1.  In Copilot Studio, select Publish from the top command bar.
2.  Confirm the publish action. All changes go live after publishing.

#### Step 3 — Verify in your target channel

Test the agent in its deployed channel (such as Teams or webchat) to confirm end-to-end behavior, including:

*   Connection authentication (some connectors prompt users for credentials on first use)
*   File uploads (for Document Extraction)
*   File downloads (for Text to Word Document)

## Using components with a managed solution

The **managed** solution is the recommended option for most users. Components are imported as read-only — you can add them to your agents and use them without risk of accidentally modifying the underlying topics, prompts, or flows.

Even without editing the components themselves, you have two powerful ways to control behavior:

### Agent instructions

Your Copilot Studio agent's **Instructions** field is the primary way to shape how components are used. Through natural-language instructions you can control:

*   **When** a component is invoked — describe the scenarios or user intents that should trigger each tool.
*   **What data is passed** — tell the agent what context, variables, or conversation history to include.
*   **How results are presented** — specify formatting, tone, follow-up actions, or routing after a component returns its output.
*   **Overall orchestration** — define the order of operations when multiple components are involved (for example, "After the research report is generated, automatically create a Word document").

### Tool input defaults

Components added as tools (for example, AI Builder prompts) expose **input parameters** that you can configure directly in Copilot Studio — even with a managed solution. These inputs let you set defaults that are more specific than what agent instructions alone can achieve. For example:

*   Set `DocumentType` to `"invoice"` so the Document Extraction component always assumes invoice format unless the user says otherwise.
*   Pre-fill `AdditionalInstructions` with your organization's preferred writing style or compliance requirements.
*   Provide a default `ExtractionSchema` tailored to your business documents.

Input defaults are configured per-agent, so different agents can pass different values to the same shared component.

## Customizing components with an unmanaged solution

If you need to modify the component internals — changing prompt logic, editing topic flows, or rewiring connectors — you must import the **unmanaged** solution. This gives you full edit access to every topic, prompt, and flow in the Component Library.

> [!IMPORTANT]
> Component collections are shared across the environment. There is only one instance of each component per environment, so any edit you make to a topic, prompt, or flow inside the Component Library applies to **every agent** that uses that component in the same environment. Before modifying a component, confirm the change is appropriate for all consumers.

Common customizations include:

*   **Modify prompts** — Adjust AI Builder prompts to match your domain and output format.
*   **Change data sources** — Point components at your own Dataverse tables, SharePoint lists, or external connectors.
*   **Adjust topics** — Update conversation flows to match your organization's terminology and processes.
*   **Update trigger phrases** — Add trigger phrases that reflect how your users naturally ask for things.
*   **Add authentication** — Configure authentication if components need to access user-specific data.

**Tip:** If you need different behavior for different agents, consider creating a copy of the component in a separate solution rather than editing the shared instance.

## Related content

*   [Copilot Studio Kit overview](https://learn.microsoft.com/microsoft-copilot-studio/guidance/kit-overview)
*   [Install Copilot Studio Kit](https://learn.microsoft.com/microsoft-copilot-studio/guidance/kit-install)
*   [Create and share reusable component collections](https://learn.microsoft.com/microsoft-copilot-studio/authoring-export-import-copilot-components)
*   [Create and manage solutions in Copilot Studio](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-overview)
*   [Export and import agents using solutions](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-import-export)
*   [Use shared tools from the Tools page](https://learn.microsoft.com/microsoft-copilot-studio/library-add-actions)
*   [Add an agent flow to an agent as a tool](https://learn.microsoft.com/microsoft-copilot-studio/flow-agent)
*   [Use Power Platform connectors as tools](https://learn.microsoft.com/microsoft-copilot-studio/advanced-connectors)
*   [Use prompts to make your agent perform specific tasks](https://learn.microsoft.com/microsoft-copilot-studio/nlu-prompt-node)
*   [Copilot Studio Kit on GitHub](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit)
*   [Microsoft Copilot Studio documentation](https://learn.microsoft.com/microsoft-copilot-studio/)
*   [AI Builder documentation](https://learn.microsoft.com/ai-builder/)