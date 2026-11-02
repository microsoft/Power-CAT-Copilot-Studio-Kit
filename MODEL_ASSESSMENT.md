# Model Assessment (Preview)

## Table of Contents

- [1. Overview](#1-overview)
  - [Key capabilities](#key-capabilities)
  - [Architecture](#architecture)
- [2. Prerequisites](#2-prerequisites)
- [3. Setup Instructions](#3-setup-instructions)
  - [3.1 Turn on the Model Assessment flows](#31-turn-on-the-model-assessment-flows)
  - [3.2 Set up the connection references](#32-set-up-the-connection-references)
  - [3.3 Make an agent eligible](#33-make-an-agent-eligible)
  - [3.4 Publish the AI prompts](#34-publish-the-ai-prompts)
- [4. How It Works — End-to-End Flow](#4-how-it-works--end-to-end-flow)
  - [4.1 Copilot Studio evaluations flow](#41-copilot-studio-evaluations-flow)
  - [4.2 Copilot Agent Kit tests flow](#42-copilot-agent-kit-tests-flow)
  - [4.3 Regression status](#43-regression-status)
  - [4.4 Copilot Credits](#44-copilot-credits)
- [5. AI Prompts](#5-ai-prompts)
  - [5.1 Explain Copilot Studio Assessment](#51-explain-copilot-studio-assessment)
  - [5.2 Explain Copilot Agent Kit Assessment](#52-explain-copilot-agent-kit-assessment)
  - [5.3 Recommend Model from Assessment Comparison](#53-recommend-model-from-assessment-comparison)
- [6. Using Model Assessment — Step by Step](#6-using-model-assessment--step-by-step)
  - [6.1 Open Model Assessment](#61-open-model-assessment)
  - [6.2 Find an agent](#62-find-an-agent)
  - [6.3 Capture a baseline](#63-capture-a-baseline)
  - [6.4 Change the model and assess it](#64-change-the-model-and-assess-it)
  - [6.5 Choose Kit tests or Copilot Studio evaluations](#65-choose-kit-tests-or-copilot-studio-evaluations)
  - [6.6 Compare model runs](#66-compare-model-runs)
  - [6.7 Read the model recommendation](#67-read-the-model-recommendation)
  - [6.8 Review test results and export](#68-review-test-results-and-export)
- [7. Data Model](#7-data-model)
- [8. Status Reference](#8-status-reference)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Related Microsoft Guidance](#10-related-microsoft-guidance)

---

## 1. Overview

**Model Assessment** helps makers check how a Copilot Studio agent behaves on a different AI model *before* they keep that model. It runs the same tests against the agent on its previous model and on its new model. It then shows what improved, what regressed and what still fails, and recommends which model to keep.

It's part of the **Copilot Agent Kit for Makers** code app (React, Fluent UI v9), under **Advanced Testing**. The backend is the **Model Assessment** solution (`cat_ModelAssessmentTracker`), which contains four Dataverse tables, two cloud flows and three AI Builder prompts.

An agent can be assessed with either of two test engines. **Their results are never compared with each other**, because they score different things:

| Test engine | What runs | Results stored in |
|---|---|---|
| **Copilot Studio evaluations** | Copilot Studio agent evaluation test sets whose name contains `MODELCHECK` | `cat_evaluationresult` (one row per test case × metric) |
| **Copilot Agent Kit tests** | A Kit test set, run through a pipeline-enabled Kit Agent Configuration against the **published** agent | Kit test run (`cat_copilottestrun`) and its results, linked from the assessment run |

### Key capabilities

- **Automatic agent discovery.** Agents with a `MODELCHECK` evaluation test set or a pipeline-enabled Kit Agent Configuration are listed and tracked automatically.
- **Baseline capture.** The first run records how the agent performs on its current model.
- **Model change detection.** The flow reads the agent's model from Copilot Studio and compares it with the last assessed model.
- **In-app model switch.** You can pick the new model from the app. For Kit tests, the app also publishes the agent.
- **Regression scoring.** Each run gets a regression status of Healthy, Warning or Critical, plus per-test deltas (Improved, Regressed, Unchanged).
- **AI analysis.** An AI Builder prompt writes a plain-language summary of each run.
- **Compare model runs.** You can view up to three runs side by side, with test-by-test results and Copilot Credits, and export them to PDF.
- **Model recommendation.** When two runs of the same kind are selected, the app decides a verdict and confidence level, and an AI prompt explains it.

### Architecture

```mermaid
flowchart LR
    subgraph APP["① Makers app · Advanced Testing › Model Assessment"]
        direction TB
        G["Agents grid"] --> DR["Agent drawer"] --> R["Run<br/>model picker, Kit/eval switch"] --> PP["Progress panel<br/>polls run status"] --> C["Compare dialog<br/>+ Model recommendation"]
    end
    DV[("② Dataverse<br/>cat_trackedagent · cat_modelhistory<br/>cat_evaluationrun · cat_evaluationresult<br/>bots / botcomponents (Copilot Studio)<br/>cat_copilottestrun (Copilot Agent Kit)")]
    subgraph FLOWS["③ Cloud flows"]
        direction TB
        F1["Model Assessment | Run Copilot Studio Evaluations<br/>lock › detect model › baseline ›<br/>run MODELCHECK test sets › score › AI explain"]
        F2["Model Assessment | Run Copilot Agent Kit Tests<br/>create Kit test run › poll ›<br/>compare with previous Kit run › AI explain"]
        F1 -->|"Kit mode: status = Evaluation Running"| F2
    end
    subgraph SVC["④ Test engines"]
        direction TB
        MCS["Microsoft Copilot Studio connector<br/>evaluations"]
        KIT["Kit action<br/>cat_RunAgentTestsAutomated"]
    end
    subgraph PROMPTS["⑤ AI Builder prompts"]
        direction TB
        P1["Explain Copilot Studio Assessment"]
        P2["Explain Copilot Agent Kit Assessment"]
        P3["Recommend Model from Assessment Comparison"]
    end
    APP <-->|"create run · read agents, runs, results"| DV
    DV <-->|"row created · results, status, AI analysis"| FLOWS
    F1 --> MCS
    F2 --> KIT
    F1 --> P1
    F2 --> P2
    C -->|Predict| P3
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class G,DR,R,PP,C app
    class DV data
    class F1,F2 flow
    class MCS,KIT grey
    class P1,P2,P3 ai
```

---

## 2. Prerequisites

| # | Prerequisite | Details |
|---|---|---|
| 1 | **Copilot Agent Kit installed** | The Model Assessment solution depends on the Copilot Agent Kit solution (`CopilotStudioAccelerator`). It uses the Kit's Agent Configuration, test set and test run tables, the `cat_RunAgentTestsAutomated` action, the Kit connection references and the Kit security roles. |
| 2 | **Model Assessment solution imported** | Solution `cat_ModelAssessmentTracker` (display name **Model Assessment**). |
| 3 | **Connection references set** | `cat_CopilotStudioAcceleratorDataverse` (*Copilot Studio Kit - Dataverse*, Microsoft Dataverse) is used by both flows. `cat_CopilotStudioKitAutomatedTests` (*Copilot Agent Kit - Automated Tests*, Microsoft Copilot Studio) is used to run evaluations. Both belong to the Copilot Agent Kit solution. |
| 4 | **Both flows turned on** | **Model Assessment \| Run Copilot Studio Evaluations** and **Model Assessment \| Run Copilot Agent Kit Tests**. |
| 5 | **Three AI prompts published** | Explain Copilot Studio Assessment, Explain Copilot Agent Kit Assessment, and Recommend Model from Assessment Comparison. |
| 6 | **Security role** | Model Assessment is a Makers feature, so users with either **CSK - Maker** or **CSK - Administrator** can use it. Both roles grant Read on tracked agents and Create on assessment runs. The Model Assessment solution doesn't add roles of its own. |
| 7 | **App sharing** | The Copilot Agent Kit code app must be shared with makers. See the [app sharing steps in the Agent Insights Hub guide](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INSIGHTS_HUB.md#2-prerequisites). |
| 8 | **Tests for each agent** | At least one of: an **active** Copilot Studio evaluation test set with `MODELCHECK` in its name, or a Kit **Agent Configuration** with **Pipeline Enabled** on and a Kit **test set**. |
| 9 | **Capacity for AI prompts and evaluations** | Running an assessment spends Copilot Credits: the agent answers each test question, and an AI prompt summarizes the results. See [AI Builder licensing and Copilot Credits](https://learn.microsoft.com/ai-builder/message-management). |

> [!NOTE]
> Kit tests run against the **published** agent. Copilot Studio evaluations don't need the agent to be published.

---

## 3. Setup Instructions

### 3.1 Turn on the Model Assessment flows

1. Go to [make.powerapps.com](https://make.powerapps.com) and select the Copilot Agent Kit environment.
2. Open **Solutions** › **Model Assessment** › **Cloud flows**.
3. Turn on **Model Assessment | Run Copilot Studio Evaluations** and **Model Assessment | Run Copilot Agent Kit Tests**.

If a flow is off, the app shows a message such as *"The Model Assessment | Run Copilot Studio Evaluations flow is turned off, so the assessment can't start."*

### 3.2 Set up the connection references

1. Open **Solutions** › **Copilot Agent Kit** › **Connection references**.
2. Make sure **Copilot Studio Kit - Dataverse** (`cat_CopilotStudioAcceleratorDataverse`) has a connection.
3. Make sure **Copilot Agent Kit - Automated Tests** (`cat_CopilotStudioKitAutomatedTests`) has a Microsoft Copilot Studio connection. The connection's user must have access to the agents you want to assess.

> [!IMPORTANT]
> If the Copilot Studio connection reference is missing or has no connection, evaluation runs fail with error category **Connector** and the message *"The Copilot Studio connection used by the assessment flow is missing or not set up…"*.

### 3.3 Make an agent eligible

An agent appears in Model Assessment as soon as it meets **either** condition below. Eligible agents are added to the tracked-agents table automatically.

**Option A: Copilot Studio evaluations**

1. In Copilot Studio, open the agent › **Evaluation**.
2. Create a test set and include **`MODELCHECK`** in its **name**, for example `MODELCHECK - HR policies`.
3. Add test cases and graders (for example General quality, Compare meaning, Keyword match, Custom labels or Capability use). See [Create a test set](https://learn.microsoft.com/microsoft-copilot-studio/analytics-agent-evaluation-create).
4. Keep the test set **active**. Only active `MODELCHECK` test sets are run.

**Option B: Copilot Agent Kit tests**

1. In the Copilot Agent Kit, create an **Agent Configuration** (Test Automation) for the agent and turn on **Pipeline Enabled**.
2. Create a Kit **test set** with tests for the agent.
3. Publish the agent in Copilot Studio.

> [!NOTE]
> Kit test automation supports standard agents only. Agents that run on the GitHub Copilot harness can be assessed only with Copilot Studio evaluations.

### 3.4 Publish the AI prompts

The three prompts are shipped in the solution. In **AI hub** › **Prompts**, check that each one is published. If the recommendation prompt isn't published, the Compare dialog shows *"…isn't published in this environment. Import or update the Model Assessment solution."*

---

## 4. How It Works — End-to-End Flow

Selecting **Run** in the app creates one row in `cat_evaluationrun` with status **Requested**. Everything after that is done by the two flows. The app polls the row every few seconds and shows progress.

```mermaid
sequenceDiagram
    autonumber
    actor Maker
    participant App as Makers app
    participant DV as Dataverse
    participant F1 as Flow 1: Run Copilot Studio Evaluations
    participant MCS as Copilot Studio connector
    participant F2 as Flow 2: Run Copilot Agent Kit Tests
    participant Kit as Kit action
    participant AI as AI Builder prompt

    Maker->>App: Select Run
    App->>DV: Create cat_evaluationrun (Requested)
    DV--)F1: Trigger (row created)
    F1->>DV: Take per-agent lock, status Detecting
    F1->>DV: Detect model (bots / botcomponents), find baseline
    F1->>DV: Status Evaluation Running
    alt Kit tests selected
        F1->>DV: Record model history, hand off
        DV--)F2: Trigger (status changed)
        F2->>DV: Create Kit test run
        F2->>Kit: cat_RunAgentTestsAutomated
        loop Every 1 min (40-minute deadline)
            F2->>DV: Read Kit test results
        end
        F2->>AI: Explain Copilot Agent Kit Assessment
        F2->>DV: Kit AI summary, run Completed
    else Copilot Studio evaluations
        loop Each ACTIVE MODELCHECK test set
            F1->>MCS: Run test set, poll every 20 s
            F1->>DV: Write cat_evaluationresult rows
        end
        F1->>AI: Explain Copilot Studio Assessment
        F1->>DV: Regression status, AI analysis, run Completed
    end
    loop Meanwhile, every 4 s (slows to 10 s)
        App->>DV: Read run status
    end
    App-->>Maker: Result, AI analysis, Model history row
```

### 4.1 Copilot Studio evaluations flow

**Model Assessment | Run Copilot Studio Evaluations** starts when a `cat_evaluationrun` row is **created**.

```mermaid
flowchart TD
    A(["Row created"]) --> L{"Per-agent lock<br/>cat_activeagentkey<br/>expires after 45 min"}
    L -->|another run active| SK["Skip<br/>one run per agent"]
    L -.->|"stale lock (finished run or expired)"| ST["Old run = Stale"]
    L -->|lock acquired| DT["Status = Detecting"]
    DT --> M{"Detect model from<br/>Copilot Studio"}
    M -->|GitHub Copilot harness agent| M1["agentSettings.model.series"]
    M -->|Other agents| M2["GPT component (type 15)<br/>modelNameHint"]
    M -->|Not found| MU["Metadata Unavailable"]
    M1 --> B
    M2 --> B
    B["Find baseline<br/>latest Completed / Completed With Errors<br/>run on the previous model"] --> NC{"Same model AND<br/>usable baseline?"}
    NC -->|yes| NCH["No Change<br/>analysis Skipped"]
    NC -->|no| ER["Status = Evaluation Running"]
    ER --> K{"Kit tests selected?"}
    K -->|yes| KH["Record model history<br/>hand off to Flow 2"]
    K -->|no| TS{"ACTIVE test sets with MODELCHECK<br/>in name or description?"}
    TS -->|none| NE["No Evaluations Configured"]
    TS -->|found| CR{"Connection reference<br/>cat_CopilotStudioKitAutomatedTests?"}
    CR -->|missing| FC["Failed (Connector)"]
    CR -->|ok| L1
    subgraph LOOP["For each test set, one at a time"]
        L1["Run test set<br/>poll every 20 s, up to 30 min"] --> L2["Write one result per test case × metric<br/>Pass / Fail / Error / Excluded"] --> L3["Compare with baseline result<br/>Improved / Regressed / Unchanged / Unmatched"] --> L4["Harness agents only<br/>add Copilot Credits (conversation + evaluators)"]
    end
    L4 --> RS["Regression status (see 4.3)"] --> AIP[/"AI prompt<br/>Explain Copilot Studio Assessment"/]
    AIP --> DONE["Completed<br/>or Completed With Errors if a test set couldn't run"]
    DONE --> CM["Agent's current model is updated<br/>ONLY if there were no errors"]
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class SK,MU,NCH,NE,FC stop
    class ST,KH warn
    class AIP ai
    class DONE,CM ok
```

Throughout the run the flow checks for **Cancelled** and stops if you cancelled. If any step fails, a final handler sets the run to **Failed** with a message such as *"The assessment stopped while &lt;stage&gt;. Step "&lt;step&gt;" failed: …"*, assigns an error category (Connector, Timeout, Authorization, Data or AI), and releases the lock.

### 4.2 Copilot Agent Kit tests flow

**Model Assessment | Run Copilot Agent Kit Tests** starts when the run's status changes to **Evaluation Running** or **No Change**.

```mermaid
flowchart TD
    S(["Status changed to<br/>Evaluation Running or No Change"]) --> G1{"Run cancelled, Kit not selected,<br/>or Kit already handled?"}
    G1 -->|yes| X1["Stop"]
    G1 -->|no| G2{"No Change?"}
    G2 -->|yes| X2["Kit status Skipped<br/>#quot;No model change was detected…#quot;"]
    G2 -->|no| G3{"Agent Configuration<br/>and test set present?"}
    G3 -->|no| X3["Failed"]
    G3 -->|yes| C1["Create Kit test run"] --> C2["Kit status Running"] --> C3[/"Call cat_RunAgentTestsAutomated"/]
    C3 --> PL{"Poll every 1 min"}
    PL -->|"complete, no results pending<br/>(waits up to 15 more min for enrichment)"| AN["Kit status Analysing"]
    PL -->|Kit run error| X4["Failed"]
    PL -->|cancelled| X5["Cancelled"]
    PL -->|40-minute deadline| X6["Timed Out"]
    AN --> E{"Every test errored?"}
    E -->|yes| X7["Failed<br/>#quot;None of the N Kit tests got a response…#quot;"]
    E -->|no| CMP["Compare with the previous completed Kit run<br/>regressed = failed now, passed before<br/>improved = the reverse"]
    CMP --> AIP[/"AI prompt<br/>Explain Copilot Agent Kit Assessment"/]
    AIP --> DONE["Kit status Completed; run Completed<br/>or Completed With Errors if any test<br/>errored or is still pending"]
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class X1,X2,X3,X4,X5,X6,X7 stop
    class AIP ai
    class DONE ok
```

### 4.3 Regression status

Both flows compute the regression status in the same way. The **worse** of two checks wins:

```mermaid
flowchart LR
    subgraph ABS["Absolute check (this run)"]
        A1["No pass/fail → Not Assessed"]
        A2["0 fails → Healthy"]
        A3["fails ≤ 20% → Warning"]
        A4["fails #gt; 20% → Critical"]
    end
    subgraph DEL["Delta check (vs baseline)"]
        D1["No baseline or no regressions → neutral"]
        D2["regressed ≤ 20% of scored → Warning"]
        D3["regressed #gt; 20% of scored → Critical"]
    end
    ABS --> RS{{"Regression status =<br/>max(absolute, delta)"}}
    DEL --> RS
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class A1 grey
    class A2 ok
    class A3,D2 warn
    class A4,D3 stop
    class D1 grey
```

> [!NOTE]
> These 20% rules set the **run's** regression status. The AI prompts use separate pass-rate bands (Healthy ≥ 95%, Warning 75–95%, Critical < 75%) to word their summaries. The two are independent.

### 4.4 Copilot Credits

| Item | Behavior |
|---|---|
| Credits per run | Recorded **only for agents on the GitHub Copilot harness**, from the `consumption` data that Copilot Studio returns with each evaluation run. Stored as *Conversation Credits* (answering) and *Evaluator Credits* (scoring). |
| Partial credits | If Copilot Studio reports a partial total, the run is flagged **Credits Partial**. |
| Kit tests | Kit tests don't report Copilot Credits. |
| Where shown | Model history rows, run cards in the Compare dialog (for example *Est. 1.40 Copilot Credits*, with *(partial)* when the total is partial), per–test-case and per–test-set rows, and the PDF export. |

---

## 5. AI Prompts

All three are AI Builder prompts that ship in the solution.

| Prompt | Model | Called by | Input | Output |
|---|---|---|---|---|
| Explain Copilot Studio Assessment | GPT-5 reasoning | Flow 1 | `AssessmentData` (JSON text) | Text → *Overall AI Analysis* |
| Explain Copilot Agent Kit Assessment | GPT-5 reasoning | Flow 2 | `AssessmentData` (JSON text) | Text → *Kit AI summary* and *Overall AI Analysis* |
| Recommend Model from Assessment Comparison | GPT-4.1, temperature 0 | Makers app (Compare dialog) | `ComparisonData` (JSON text) | JSON: verdict, confidence, headline, reasons, trade-offs, caveats |

If the Copilot Studio explain prompt fails, the evaluation run still finishes; only the AI analysis is missing.

### 5.1 Explain Copilot Studio Assessment

```mermaid
flowchart LR
    IN["Flow 1 collects<br/>• regression status, baseline or not<br/>• pass / fail / error counts<br/>• still passing, persistent failures, missing questions<br/>• previous and current model<br/>• failed checks per test set<br/>• evaluator reasons per test case"]
    RULES["Prompt rules<br/>• business-user language<br/>• no numbers or percentages<br/>• at most 15 lines<br/>• only claims the evidence supports"]
    P{{"Explain Copilot Studio Assessment<br/>input: AssessmentData"}}
    OUT["Overall (always)<br/>Works well · Needs attention · What changed<br/>Instruction focus · Evidence limits (optional)"]
    IN --> P
    RULES -.-> P
    P --> OUT
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class IN data
    class RULES grey
    class P ai
    class OUT ok
```

### 5.2 Explain Copilot Agent Kit Assessment

```mermaid
flowchart TB
    IN["Flow 2 collects<br/>agent, previous/current model, test set, counts,<br/>enrichment state, each test with its type and child steps"] --> S1
    subgraph STEPS["Explain Copilot Agent Kit Assessment"]
        direction TB
        S1["1 · Extract the evidence"] --> S2["2 · Resolve units<br/>multi-turn tests are scored as one unit"] --> S3["3 · Rating = passed / (passed + failed + pending)<br/>Healthy ≥ 95% · Warning 75–95% · Critical #lt; 75%<br/>errors are left out"] --> S4["4 · Classify results<br/>noting enrichment still running"] --> S5["5 · Describe behavior per test type"] --> S6["6 · Recommend only what<br/>agent instructions can change"]
    end
    S6 --> OUT["Kit AI summary on the run"]
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class IN data
    class S1,S2,S3,S4,S5,S6 ai
    class OUT ok
```

### 5.3 Recommend Model from Assessment Comparison

This prompt **explains** a decision; it doesn't make it. The Makers app computes the verdict and confidence in code (`contracts/model-recommendation.ts`), so the same two runs always get the same verdict. The prompt runs at temperature 0 and writes the headline, reasons, trade-offs and caveats around that decision.

#### When a recommendation is requested

```mermaid
flowchart TD
    A(["Runs selected in the Compare dialog"]) --> B{"Fewer than 2 runs?"}
    B -->|yes| M1["#quot;Select two completed runs to get a recommendation.#quot;"]
    B -->|no| C{"3 runs?"}
    C -->|yes| M2["#quot;A recommendation compares two runs…#quot;"]
    C -->|no| D{"One Kit run +<br/>one evaluation?"}
    D -->|yes| M3["#quot;Copilot Studio evaluations and Copilot Agent Kit tests<br/>score different things…#quot;"]
    D -->|no| E{"Kit results<br/>failed to load?"}
    E -->|yes| M4["#quot;Kit test results couldn't load…#quot;"]
    E -->|no| F{"No check scored<br/>in both runs?"}
    F -->|yes| M5["#quot;These runs have no test results scored in both…#quot;"]
    F -->|no| G["Build ComparisonData"] --> H["Decide verdict + confidence"] --> I[/"Call prompt (Predict)"/]
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class M1,M2,M3,M4,M5 grey
    class I ai
```

A **shared check** is a test case and metric, or a Kit test, that has a Pass or Fail in **both** runs. The pass rates in the decision use shared checks only.

#### How the verdict is decided (first matching rule wins)

```mermaid
flowchart TD
    R1{"1 · Fewer than 3 shared checks<br/>OR either run has ≥ 50% errors?"} -->|yes| V1["Not enough data"]
    R1 -->|no| R2{"2 · Both runs below 75%<br/>on shared checks?"}
    R2 -->|yes| V2["Neither recommended"]
    R2 -->|no| R3{"3 · Both runs used<br/>the same model?"}
    R3 -->|yes| V3["No clear winner"]
    R3 -->|no| R4{"4 · One run ≥ 5 points better AND<br/>wins ≥ 2 more checks than it loses?"}
    R4 -->|yes| V4["Recommended<br/>(that model)"]
    R4 -->|no| R5{"5 · Both runs report credits, they ran<br/>the same checks, and one costs ≥ 15% less?"}
    R5 -->|yes| V5["Recommended<br/>(cheaper model)"]
    R5 -->|no| V6["6 · No clear winner"]
    classDef app fill:#DEECF9,stroke:#0F6CBD,color:#000
    classDef data fill:#DFF6DD,stroke:#107C10,color:#000
    classDef flow fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef ai fill:#EDE3FA,stroke:#8764B8,color:#000
    classDef ok fill:#DFF6DD,stroke:#107C10,color:#000
    classDef stop fill:#FDE7E9,stroke:#C50F1F,color:#000
    classDef warn fill:#FFF4CE,stroke:#C19C00,color:#000
    classDef grey fill:#F3F2F1,stroke:#8A8886,color:#000
    class V1,V3,V6 grey
    class V2 warn
    class V4,V5 ok
```

Credits only break a quality tie (rule 5). They never override a clear quality difference. Because Kit tests don't report credits and evaluations report them only for harness agents, most comparisons are decided on quality alone.

#### How confidence is decided

| Confidence | When |
|---|---|
| **Low** | Not enough data, **or** fewer than 8 shared checks, **or** shared checks are under half of the larger run, **or** either run has ≥ 20% errors, **or** either run Completed With Errors |
| **Medium** | Otherwise, if 8–19 shared checks, **or** checks that ran in only one run exceed 10% of shared checks, **or** a quality win by fewer than 4 net checks, **or** a credit win where credits are partial |
| **High** | None of the above |

#### Output

| Field | Meaning |
|---|---|
| Verdict badge | **Recommended**, **No clear winner**, **Neither recommended** or **Not enough data** |
| Confidence badge | **High**, **Medium** or **Low confidence** |
| Headline | One sentence |
| Reasons | Why, based on shared checks |
| Trade-offs | For example, the recommended model costs more credits |
| Keep in mind | Caveats such as a small sample, errors or a credits note |

The app caches each recommendation per pair of runs for the session, so reopening the same pair doesn't call the prompt again. The call is attempted up to three times when it's throttled or hits a transient error.

---

## 6. Using Model Assessment — Step by Step

### 6.1 Open Model Assessment

1. Open **Copilot Agent Kit for Makers**.
2. Select **Advanced Testing**, then **Model assessment** in the quick actions.

![Advanced Testing page with the Model assessment quick action](media/model-assessment/01-advanced-testing-entry.png)

### 6.2 Find an agent

The **Agents** grid lists every eligible agent with its **Previous model**, **Current model**, **Regression**, **Last run** and **Latest results** (pass, fail and error counts).

- Use the filter chips **All**, **Needs attention**, **Critical**, **Warning** and **Healthy**.
- Search by agent name or schema name.
- Select **Refresh agents** to reload.

![Model Assessment agents grid](media/model-assessment/02-model-assessment-agents.png)

The first time you open the page, a short tour explains the steps. You can replay it any time from **Help** › **Take the tour**. Help also links to Microsoft guidance on validating a model change and choosing an agent's model.

| | |
|---|---|
| ![Tour step 1: Choose an agent to assess](media/model-assessment/tour-0.png) | ![Tour step 2: Capture a baseline, then change the model](media/model-assessment/tour-1.png) |
| ![Tour step 3: Read the outcome](media/model-assessment/tour-2.png) | ![Tour step 4: Need guidance?](media/model-assessment/tour-3.png) |

![Help menu](media/model-assessment/03-help-menu.png)

### 6.3 Capture a baseline

1. Select an agent to open its drawer.
2. If there's no baseline yet, the drawer shows *"No baseline captured yet. Select Run to capture one."*
3. Select **Run**. The progress panel shows the steps:

   | Copilot Studio evaluations | Copilot Agent Kit tests |
   |---|---|
   | Initializing | Initializing |
   | Running evaluations (discovering MODELCHECK test sets and running test cases) | Running Kit tests (sending each test utterance to the published agent) |
   | Scoring results | Scoring results (comparing with the previous Kit run) |
   | Generating AI analysis | Generating AI analysis |

4. You can close the drawer while it runs; the run continues in the background. To stop it, select **Cancel assessment**. The assessment stops and won't be scored.

Only one assessment can run per agent at a time. If someone else is already assessing the agent, the app says so.

### 6.4 Change the model and assess it

After the baseline, the drawer asks **Want to try a different model?**

1. Pick a model in the **Model** picker. The app saves it to the agent. For Kit tests it also **publishes** the agent, because Kit tests run against the published version.
2. Alternatively, change the model in Copilot Studio (**Open agent in Copilot Studio** › **Settings**), then come back. The drawer shows **New model detected**.
3. Select **Run**. If the model hasn't changed, the app tells you: *"Model unchanged since the last run. Update the model, then select Run."*

The **Model history** list shows the baseline and each model change, with credits where reported and a **With errors** tag where a run had errors.

![Agent drawer for Zava Kit Test Automation with the model picker and model history](media/model-assessment/07-agent-drawer-zkta.png)

> [!NOTE]
> The agent's model is recorded as changed only after an assessment completes **without errors**. If a test set couldn't run, fix it and select **Run** again.

### 6.5 Choose Kit tests or Copilot Studio evaluations

If an agent has both kinds of tests, the drawer shows *"This agent has both Copilot Agent Kit tests and Copilot Studio evaluations. Choose which one to run."* Use the **Kit evaluation / Copilot Studio evaluation** switch.

For Kit tests, choose an **Agent configuration** and a **Test set**. If there's only one configuration, it's selected for you.

![Agent drawer for Zava Workplace Assistant with the Kit or Copilot Studio switch](media/model-assessment/15-agent-drawer-zwa.png)

### 6.6 Compare model runs

Select a row in **Model history** to open **Compare model runs**. You can select up to three completed runs; they're shown oldest to newest.

![Compare dialog with a recommendation for Zava Kit Test Automation](media/model-assessment/09-compare-recommendation.png)

Use the run picker to change which runs are compared:

![Run picker in the Compare dialog](media/model-assessment/13-compare-run-picker.png)

The **Summary** tab shows a card per run with the model, date, run status, regression status, results and estimated credits. Below the cards, the **AI summary** section starts with the **Model recommendation** card, followed by each run's AI summary (Overall, Works well, Needs attention, What changed, Evidence limits…).

![Run cards with AI summaries](media/model-assessment/11-compare-run-cards.png)

If the earlier model was assessed with a different test engine, the dialog explains that the runs can't be compared and picks the latest run of the same kind instead:

![Notice when the previous run used a different test engine](media/model-assessment/18-compare-kind-mismatch.png)

### 6.7 Read the model recommendation

The **Model recommendation** card is the first item in the **AI summary** section. It appears when exactly two runs of the same kind are selected, and shows a verdict, a confidence level, a headline, reasons, trade-offs and points to keep in mind.

**Recommended.** The screenshot in [6.6](#66-compare-model-runs) recommends GPT-5 Chat at Medium confidence: quality is effectively tied, and it uses 61.8% fewer Copilot Credits than GPT 5.6 Sol.

**Neither recommended.** Both models scored below 75% on the shared checks:

![Neither recommended verdict](media/model-assessment/14-recommendation-neither.png)

**No clear winner.** The quality difference is too small to recommend either model:

![No clear winner verdict](media/model-assessment/17-recommendation-no-clear-winner.png)

**Kit tests vs Kit tests.** A comparison of two Kit runs with only three shared checks. Neither model is recommended, confidence is Low, and the card notes that Copilot Credits weren't reported for these tests:

![Kit comparison with low confidence](media/model-assessment/19-compare-kit.png)

> [!TIP]
> The recommendation is guidance, not a guarantee. Check the reasons and the test results before you change models.

### 6.8 Review test results and export

The **Test runs** tab lists each test case, its metric, and its result in every selected run, grouped by test set.

![Test runs tab](media/model-assessment/12-compare-test-runs.png)

Use **Needs attention** to show only failed or error results:

![Needs attention filter](media/model-assessment/12b-compare-needs-attention.png)

For Kit runs, the tab lists each Kit test with its result per run:

![Kit test runs tab](media/model-assessment/20-compare-kit-test-runs.png)

Select **Export to PDF** to download the comparison as `ModelAssessment_<agent>_<timestamp>.pdf`.

---

## 7. Data Model

| Table | Purpose | Key columns |
|---|---|---|
| **Tracked Agent** (`cat_trackedagent`) | One row per agent being followed | Copilot Agent ID, Current Model (last assessed), Source Status, Run Kit tests, Kit agent configuration, Kit test set |
| **Model History** (`cat_modelhistory`) | Baseline and model-change events | Change Type (Baseline / Model Changed), Previous Model, Current Model, Originating Evaluation Run |
| **Evaluation Run** (`cat_evaluationrun`) | One assessment request and its outcome | Status, Analysis Status, Regression Status, Error Category/Message, counts, Overall AI Analysis, Conversation/Evaluator Credits, Credits Partial, Compared To Run, Kit status/counts/message/AI summary, Kit test run |
| **Evaluation Result** (`cat_evaluationresult`) | One row per test case × metric (Copilot Studio evaluations) | Test Set, Test Case, Utterance, Metric Type, Result Status, Result Reason, credits |

```mermaid
erDiagram
    cat_trackedagent ||--o{ cat_modelhistory : "has"
    cat_trackedagent ||--o{ cat_evaluationrun : "has"
    cat_evaluationrun ||--o{ cat_evaluationresult : "has"
    cat_evaluationrun }o--o| cat_modelhistory : "Model History"
    cat_evaluationrun |o--o| cat_copilottestrun : "Kit test run"
    cat_evaluationrun {
        lookup cat_comparedtorunid "Compared To Run: another cat_evaluationrun"
    }
```

---

## 8. Status Reference

**Run status**

| Status | Meaning |
|---|---|
| Requested | Created by the app; waiting for the flow |
| Detecting | Reading the agent's model |
| Evaluation Running | Tests are running (or handed off to Kit tests) |
| Completed | Finished without errors |
| Completed With Errors | Finished, but some test sets or tests couldn't run |
| No Change | Model is the same as the last assessed model |
| No Evaluations Configured | No active `MODELCHECK` test set |
| Metadata Unavailable | The agent's model couldn't be read |
| Failed | A step failed; see Error Category and Error Message |
| Timed Out | Kit tests didn't finish within 40 minutes |
| Cancelled | You cancelled the assessment |
| Stale | Its lock expired and the next assessment reclaimed it |

**Regression status:** Not Assessed, Healthy, Warning, Critical (see [4.3](#43-regression-status)).
**Analysis status:** Not Requested, Pending, Completed, Failed, Skipped.
**Kit status:** Skipped, Running, Analysing, Completed, Failed, Timed Out.
**Result status:** Pass, Fail, Error, Excluded.
**Error category:** Connector, Timeout, Authorization, Data, AI.

---

## 9. Troubleshooting

| Symptom | Cause | Resolution |
|---|---|---|
| Agent isn't listed | No active `MODELCHECK` test set and no pipeline-enabled Kit Agent Configuration | Add `MODELCHECK` to an evaluation test set **name**, or turn on **Pipeline Enabled** on the Kit Agent Configuration. Then select **Refresh agents**. |
| *"Couldn't load assessment data from Dataverse."* | The app isn't connected to the environment with the Model Assessment tables, or you lack a role | Use the right environment and assign **CSK - Maker** or **CSK - Administrator**. Select **Retry**. |
| *"…flow is turned off, so the assessment can't start."* | A Model Assessment flow is off | Turn the flow on (see [3.1](#31-turn-on-the-model-assessment-flows)). |
| *"Request wasn't picked up"* / *"Kit tests weren't picked up"* | The flow didn't start within 6 minutes | Turning the flow on doesn't start the request that's already waiting. Check that the flow is on, then select **Start again**. |
| Another user is already assessing the agent | Only one assessment per agent at a time | Wait for it to finish. If a run never finishes, its lock expires after 45 minutes; the next assessment reclaims it and marks that run **Stale**. |
| **Failed**, Connector: *"The Copilot Studio connection used by the assessment flow is missing or not set up…"* | `cat_CopilotStudioKitAutomatedTests` has no connection | Set the connection reference (see [3.2](#32-set-up-the-connection-references)). |
| *"Connection lacks permission to this agent"* | The tracked agent's **Source Status** is **Access Denied** | Make sure the agent still exists and is shared with the user of the Copilot Studio connection. |
| **No Evaluations Configured** | No active test set contains `MODELCHECK` | Add `MODELCHECK` to a test set name in Copilot Studio and make sure it's active. |
| **Metadata Unavailable** | The model couldn't be read from the agent | Open the agent in Copilot Studio, select a model in **Settings**, save, then select **Run**. |
| **No Change** | The model is the same as the last assessed model | Change the model first. |
| **Completed With Errors**, *"No test cases were scored in this test set…"* | Copilot Studio couldn't run a test set, or it didn't finish within 30 minutes | Fix the test set in Copilot Studio, then select **Run**. The model change isn't recorded until a run completes without errors. |
| Kit: *"Kit tests are selected for this agent, but no Agent Configuration or test set is selected."* | Kit settings incomplete | Choose an **Agent configuration** and **Test set** in the drawer. |
| Kit: *"None of the N Kit tests got a response from the agent…"* | Agent not published, or the Agent Configuration can't connect | Publish the agent and check the Agent Configuration's connection settings. |
| Kit: **Timed Out**, *"The Kit tests did not finish within 40 minutes."* | Long test set, or slow responses or enrichment | Use a smaller test set or try again later. |
| Kit tests unavailable: *"This agent uses the Copilot harness…"* | Kit automation supports standard agents only | Use Copilot Studio evaluations for harness agents. |
| *"Preview and experimental models are turned off for this environment."* | The Power Platform admin center setting **Preview and experimental AI models** is off, so those models are hidden from the picker | Ask an admin to turn the setting on, or choose a generally available model. |
| No recommendation: *"…score different things. Select two runs of the same type."* | One Kit run and one evaluation run selected | Select two runs of the same kind. |
| No recommendation: *"These runs have no test results scored in both…"* | The runs share no scored checks | Run the same test sets on both models. |
| **Not enough data** / **Low confidence** | Fewer than 3 shared checks, many errors, or a run completed with errors | Add more test cases and fix erroring test sets, then rerun. |
| *"Couldn't get a recommendation"*: prompt not published | The recommendation prompt is missing or unpublished | Import or update the Model Assessment solution and publish the prompt. Select **Try again**. |
| *"No capacity is available to run AI prompts in this environment."* | No AI Builder or Copilot Credits capacity | Ask an admin to allocate capacity ([licensing](https://learn.microsoft.com/ai-builder/message-management)). |
| Credits show as unavailable | Credits are reported only for GitHub Copilot harness agents, and never for Kit tests | Expected behavior. |
| *"Export failed…"* | The PDF couldn't be generated | Read the error detail after *Export failed:* and select **Export to PDF** again. |

**Where to look in Dataverse:** open the run in `cat_evaluationrun` and check **Status**, **Error Category**, **Error Message**, **Kit message** and **Evaluation Progress**. Then open the matching run in the flow's run history.

---

## 10. Related Microsoft Guidance

- [Run and validate an AI model migration for Copilot Studio agents](https://learn.microsoft.com/microsoft-copilot-studio/guidance/manage-agent-model-migration)
- [Manage the AI model lifecycle for Copilot Studio agents](https://learn.microsoft.com/microsoft-copilot-studio/guidance/plan-agent-model-lifecycle)
- [Select a model for an agent](https://learn.microsoft.com/microsoft-copilot-studio/authoring-select-agent-model)
- [About agent evaluation](https://learn.microsoft.com/microsoft-copilot-studio/analytics-agent-evaluation-intro)
- [Run evaluations and view results](https://learn.microsoft.com/microsoft-copilot-studio/analytics-agent-evaluation-results)
- [AI Builder licensing and Copilot Credits](https://learn.microsoft.com/ai-builder/message-management)
