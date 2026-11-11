# Model Assessment (Preview)

## Table of Contents

- [1. Overview](#1-overview)
  - [Key capabilities](#key-capabilities)
- [2. Prerequisites](#2-prerequisites)
- [3. Setup Instructions](#3-setup-instructions)
  - [3.1 Turn on the Model Assessment flows](#31-turn-on-the-model-assessment-flows)
  - [3.2 Set up the connection references](#32-set-up-the-connection-references)
  - [3.3 Make an agent eligible](#33-make-an-agent-eligible)
- [4. Using Model Assessment — Step by Step](#4-using-model-assessment--step-by-step)
  - [4.1 Open Model Assessment](#41-open-model-assessment)
  - [4.2 Find an agent](#42-find-an-agent)
  - [4.3 Capture a baseline](#43-capture-a-baseline)
  - [4.4 Change the model and assess it](#44-change-the-model-and-assess-it)
  - [4.5 Choose Kit tests or Copilot Studio evaluations](#45-choose-kit-tests-or-copilot-studio-evaluations)
  - [4.6 Compare model runs](#46-compare-model-runs)
  - [4.7 Read the model recommendation](#47-read-the-model-recommendation)
  - [4.8 Review test results and export](#48-review-test-results-and-export)
- [Architecture](#architecture)
- [5. How It Works — End-to-End Flow](#5-how-it-works--end-to-end-flow)
  - [5.1 Regression status](#51-regression-status)
  - [5.2 Copilot Credits](#52-copilot-credits)
- [6. AI Prompts](#6-ai-prompts)
  - [6.1 Explain Copilot Studio Assessment](#61-explain-copilot-studio-assessment)
  - [6.2 Explain Copilot Agent Kit Assessment](#62-explain-copilot-agent-kit-assessment)
  - [6.3 Recommend Model from Assessment Comparison](#63-recommend-model-from-assessment-comparison)
- [7. Data Model](#7-data-model)
- [8. Status Reference](#8-status-reference)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Related Microsoft Guidance](#10-related-microsoft-guidance)

---

## 1. Overview

**Model Assessment** helps makers check how a Copilot Studio agent behaves on a different AI model *before* they keep that model. It runs the same tests against the agent on its previous model and on its new model. It then shows what improved, what regressed and what still fails, and recommends which model to keep.

An agent can be assessed with either of two test engines. **Their results are never compared with each other**, because they score different things:

| Test engine | What runs |
|---|---|
| **Copilot Studio evaluations** | Copilot Studio agent evaluation test sets whose name contains `MODELCHECK` |
| **Copilot Agent Kit tests** | A Kit test set, run through a pipeline-enabled Agent Configuration against the **published** agent |

### Key capabilities

- **Automatic agent discovery.** Agents with a `MODELCHECK` evaluation test set or a pipeline-enabled Kit Agent Configuration are listed and tracked automatically.
- **Baseline capture.** The first run records how the agent performs on its current model.
- **Model change detection.** The flow reads the agent's model from Copilot Studio and compares it with the last assessed model.
- **In-app model switch.** You can pick the new model from the app. For Kit tests, the app also publishes the agent.
- **Regression scoring.** Each run gets a regression status of Healthy, Warning or Critical, plus per-test deltas (Improved, Regressed, Unchanged).
- **AI analysis.** An AI Builder prompt writes a plain-language summary of each run.
- **Compare model runs.** You can view up to three runs side by side, with test-by-test results and Copilot Credits, and export them to PDF.
- **Model recommendation.** When two runs of the same kind are selected, the app decides a verdict and confidence level, and an AI prompt explains it.

---

## 2. Prerequisites

| # | Prerequisite | Details |
|---|---|---|
| 1 | **Connection references set** | `cat_CopilotStudioAcceleratorDataverse` (*Copilot Studio Kit - Dataverse*, Microsoft Dataverse) is used by both flows. `cat_CopilotStudioKitAutomatedTests` (*Copilot Agent Kit - Automated Tests*, Microsoft Copilot Studio) is used to run evaluations. |
| 2 | **Both flows turned on** | **Model Assessment \| Run Copilot Studio Evaluations** and **Model Assessment \| Run Copilot Agent Kit Tests**. |
| 3 | **Security role** | Model Assessment is a Makers feature, so users with either **CSK - Maker** or **CSK - Administrator** can use it. Both roles grant required permissions on tracked agents and Create on assessment runs. The Model Assessment solution doesn't add roles of its own. |
| 4 | **App sharing** | The Copilot Agent Kit code app must be shared with makers. See the [app sharing steps in the Agent Insights Hub guide](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INSIGHTS_HUB.md#2-prerequisites). |
| 5 | **Tests for each agent** | At least one of: an **active** Copilot Studio evaluation test set with `MODELCHECK` in its name, or a **Agent Configuration** with **Pipeline Enabled** on and a Kit **test set**. |
| 6 | **Capacity for AI prompts and evaluations** | Running an assessment spends Copilot Credits: the agent answers each test question, and an AI prompt summarizes the results. See [AI Builder licensing and Copilot Credits](https://learn.microsoft.com/ai-builder/message-management). |

> [!NOTE]
> Kit tests run against the **published** agent. Copilot Studio evaluations don't need the agent to be published.

---

## 3. Setup Instructions

### 3.1 Turn on the Model Assessment flows

1. Go to [make.powerapps.com](https://make.powerapps.com) and select the Copilot Agent Kit environment.
2. Open **Solutions** › **Model Assessment** › **Cloud flows**.
3. Turn on **Model Assessment | Run Copilot Agent Kit Tests** and **Model Assessment | Run Copilot Studio Evaluations**.

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

> [!NOTE]
> Kit test automation supports standard agents only. Agents that run on the GitHub Copilot harness can be assessed only with Copilot Studio evaluations.

---

## 4. Using Model Assessment — Step by Step

### 4.1 Open Model Assessment

1. Open **Copilot Agent Kit**.
2. Select **Advanced Testing**, then **Model assessment** in the quick actions.

![Advanced Testing page with the Model assessment quick action](media/model-assessment/01-advanced-testing-entry.png)

### 4.2 Find an agent

The **Agents** grid lists every eligible agent with its **Previous model**, **Current model**, **Regression**, **Last run** and **Latest results** (pass, fail and error counts).

- Use the filter chips **All**, **Needs attention**, **Critical**, **Warning** and **Healthy**.
- Search by agent name.
- Select **Refresh agents** to reload.

![Model Assessment agents grid](media/model-assessment/02-model-assessment-agents.png)

The first time you open the page, a short tour explains the steps. You can replay it any time from **Help** › **Take the tour**. Help also links to this documentation (**Help** › **Documentation**).

| | |
|---|---|
| ![Tour step 1: Choose an agent to assess](media/model-assessment/tour-0.png) | ![Tour step 2: Capture a baseline, then change the model](media/model-assessment/tour-1.png) |
| ![Tour step 3: Read the outcome](media/model-assessment/tour-2.png) | ![Tour step 4: Need guidance?](media/model-assessment/tour-3.png) |

![Help menu](media/model-assessment/03-help-menu.png)

### 4.3 Capture a baseline

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

### 4.4 Change the model and assess it

After the baseline, the drawer asks **Want to try a different model?**

1. Pick a model in the **Model** picker. The app saves it to the agent. For Kit tests it also **publishes** the agent, because Kit tests run against the published version.
2. Alternatively, change the model in Copilot Studio, then come back. The drawer shows **New model detected**.
3. Select **Run**. If the model hasn't changed, the app tells you: *"Model unchanged since the last run. Update the model, then select Run."*

The **Model history** list shows the baseline and each model change, with credits where reported and a **With errors** tag where a run had errors.

![Agent drawer for Zava Kit Test Automation with the model picker and model history](media/model-assessment/07-agent-drawer-zkta.png)

> [!NOTE]
> The agent's model is recorded as changed only after an assessment completes **without errors**. If a test set couldn't run, fix it and select **Run** again.

### 4.5 Choose Kit tests or Copilot Studio evaluations

If an agent has both kinds of tests, the drawer shows *"This agent has both Copilot Agent Kit tests and Copilot Studio evaluations. Choose which one to run."* Use the **Kit evaluation / Copilot Studio evaluation** switch.

For Kit tests, choose an **Agent configuration** and a **Test set**. If there's only one configuration, it's selected for you.

![Agent drawer for Zava Workplace Assistant with the Kit or Copilot Studio switch](media/model-assessment/15-agent-drawer-zwa.png)

### 4.6 Compare model runs

Select a row in **Model history** to open **Compare model runs**. You can select up to three completed runs; they're shown oldest to newest.

![Compare dialog with a recommendation for Zava Kit Test Automation](media/model-assessment/09-compare-recommendation.png)

Use the run picker to change which runs are compared:

![Run picker in the Compare dialog](media/model-assessment/13-compare-run-picker.png)

The **Summary** tab shows a card per run with the model, date, run status, regression status, results and estimated credits. Below the cards, the **AI summary** section starts with the **Model recommendation** card, followed by each run's AI summary (Overall, Works well, Needs attention, What changed, Evidence limits…).

![Run cards with AI summaries](media/model-assessment/11-compare-run-cards.png)

If the earlier model was assessed with a different test engine, the dialog explains that the runs can't be compared and picks the latest run of the same kind instead:

![Notice when the previous run used a different test engine](media/model-assessment/18-compare-kind-mismatch.png)

### 4.7 Read the model recommendation

The **Model recommendation** card is the first item in the **AI summary** section. It appears when exactly two runs of the same kind are selected, and shows a verdict, a confidence level, a headline, reasons, trade-offs and points to keep in mind.

**Recommended.** The screenshot in [4.6](#46-compare-model-runs) recommends GPT-5 Chat at Medium confidence: quality is effectively tied, and it uses 61.8% fewer Copilot Credits than GPT 5.6 Sol.

**Neither recommended.** Both models scored below 75% on the shared checks:

![Neither recommended verdict](media/model-assessment/14-recommendation-neither.png)

**No clear winner.** The quality difference is too small to recommend either model:

![No clear winner verdict](media/model-assessment/17-recommendation-no-clear-winner.png)

**Kit tests vs Kit tests.** A comparison of two Kit runs with only three shared checks. Neither model is recommended, confidence is Low, and the card notes that Copilot Credits weren't reported for these tests:

![Kit comparison with low confidence](media/model-assessment/19-compare-kit.png)

> [!TIP]
> The recommendation is guidance, not a guarantee. Check the reasons and the test results before you change models.

### 4.8 Review test results and export

The **Test runs** tab lists each test case, its metric, and its result in every selected run, grouped by test set.

![Test runs tab](media/model-assessment/12-compare-test-runs.png)

Use **Needs attention** to show only failed or error results:

![Needs attention filter](media/model-assessment/12b-compare-needs-attention.png)

For Kit runs, the tab lists each Kit test with its result per run:

![Kit test runs tab](media/model-assessment/20-compare-kit-test-runs.png)

Select **Export to PDF** to download the comparison as `ModelAssessment_<agent>_<timestamp>.pdf`.

---

## Architecture

Model Assessment runs within **Copilot Agent Kit**. The app manages model selection and comparison, Dataverse stores tracking and assessment data, and two cloud flows orchestrate Copilot Studio evaluations or Kit tests. AI Builder prompts explain the assessment results and the app-computed model recommendation.

![Model Assessment architecture showing Copilot Agent Kit, assessment flows, AI Builder prompts and Dataverse tables](media/model-assessment/model-assessment-architecture.png)

> **Implementation clarifications:** The image is a conceptual overview.
>
> - Assessment processing is triggered by creating `cat_evaluationrun`, not by updating the agent's model metadata in `bots` or `botcomponents`.
> - The Kit handoff uses a Dataverse status-change trigger, not a direct flow-to-flow call. Flow 1 creates and links model history; Flow 2 writes Kit counts, regression and AI analysis to the evaluation run.
> - Publishing is required only for Kit tests. Copilot Studio evaluations use the saved draft.

---

## 5. How It Works — End-to-End Flow

Selecting **Run** in **Copilot Agent Kit** creates one row in `cat_evaluationrun` with status **Requested**. The two flows orchestrate the assessment. The app polls the row every few seconds and shows progress.

```mermaid
sequenceDiagram
    autonumber
    actor Maker
    participant App as Copilot Agent Kit
    participant DV as Dataverse
    participant F1 as Flow 1:<br/>Run Copilot Studio<br/>Evaluations
    participant MCS as Copilot Studio<br/>connector
    participant F2 as Flow 2:<br/>Run Copilot Agent Kit<br/>Tests
    participant Kit as Kit action
    participant AI as AI Builder<br/>prompts

    Maker->>App: Select Run
    App->>DV: Create cat_evaluationrun (Requested)
    DV--)F1: Trigger (row created)
    F1->>DV: Take per-agent lock, status Detecting
    F1->>DV: Detect model (bots / botcomponents), find baseline
    F1->>DV: Status Evaluation Running
    alt Kit tests selected
        DV--)F2: Trigger (status changed, Kit-mode guard)
        F1->>DV: Record/link model history and update tracked model
        Note over F1,F2: History updates and Flow 2 can overlap
        F2->>DV: Create and link cat_copilottestrun
        F2->>Kit: Bound action cat_RunAgentTestsAutomated
        loop Every 1 min (40-minute deadline)
            F2->>DV: Read shared Kit test run/results
        end
        F2->>AI: Explain Copilot Agent Kit Assessment
        F2->>DV: Counts, regression, AI summary, finalize run
    else Copilot Studio evaluations
        loop Each ACTIVE MODELCHECK test set
            F1->>MCS: Run test set, poll every 20 s
            F1->>DV: Write cat_evaluationresult metric rows
        end
        F1->>AI: Explain Copilot Studio Assessment
        F1->>DV: Record/link model history
        F1->>DV: Counts, regression, AI analysis, finalize run
    end
    Note over F1,DV: Completed or Completed With Errors<br/>Release per-agent lock
    loop Meanwhile, every 4 s<br/>(slows to 10 s)
        App->>DV: Read run status
    end
    App-->>Maker: Result, AI analysis, model history
```

For readability, this diagram omits early exits, cancellation, timeout and failure branches. Model switching, comparison recommendations and PDF export are outside this assessment-run diagram.

### 5.1 Regression status

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

#### Terms used

| Term | Meaning |
|---|---|
| **Check** | One thing that gets a result. For Copilot Studio evaluations, one metric of one test case (a test case graded on two metrics is two checks). For Kit tests, one test. |
| **Scored** | Checks that got a **Pass** or a **Fail**. Checks with an Error, Excluded or still pending result aren't scored and aren't counted in either percentage. |
| **Baseline** | The earlier run this run is compared with (see the table below). The first run for an agent has no baseline. |
| **Regressed** | A check that **passed on the baseline and fails now**. A check that failed both times is a *persistent failure*, not a regression. A check that is new in this run can't regress. |

#### Absolute check: how is this run doing on its own?

It looks only at this run, without comparing it with anything:

1. If no check was scored, the result is **Not Assessed**.
2. If no scored check failed, the result is **Healthy**.
3. Otherwise it works out *failed ÷ scored × 100*. Up to 20% is **Warning**; more than 20% is **Critical**.

#### Delta check: did the new model break what used to work?

It compares this run with the baseline:

1. If there's no baseline, or nothing regressed, the delta check doesn't affect the status.
2. Otherwise it works out *regressed ÷ scored × 100*. Up to 20% is **Warning**; more than 20% is **Critical**.

#### Putting it together

The run's regression status is the **worse** of the two results (Critical is worse than Warning, which is worse than Healthy).

| This run | Absolute check | Delta check | Regression status |
|---|---|---|---|
| 20 scored: 20 pass, 0 fail | 0% failed → Healthy | Nothing regressed | **Healthy** |
| 20 scored: 16 pass, 4 fail; 3 of the 4 passed on the baseline | 20% failed → Warning | 15% regressed → Warning | **Warning** |
| 18 scored: 14 pass, 4 fail; none passed on the baseline | 22% failed → Critical | Nothing regressed | **Critical** |
| Only errors, nothing scored | Not Assessed | No effect | **Not Assessed** |

Every regressed check is also a failed check, and both percentages divide by the same number of scored checks. So the delta check can never be worse than the absolute check, and in practice the absolute check decides the status. The regressed count still matters: it appears on the run and in the AI summary as what the model change broke.

A run also stays **Not Assessed** when it doesn't score anything. This happens when the model hasn't changed since a usable baseline (run status **No Change**), when no test set is configured, or when the run fails.

| Item | Copilot Studio evaluations (Flow 1) | Copilot Agent Kit tests (Flow 2) |
|---|---|---|
| Unit counted | One metric of one test case | One test |
| Baseline | Latest completed run on the previous model | Latest run of the agent with completed Kit tests |
| Regressed | Pass on the baseline, Fail now | Passed on the baseline, Failed now |
| Errors | Not counted in the percentages | Not counted in the percentages |

Percentages are whole numbers rounded down, so 20.5% failed counts as 20% (Warning).

> [!NOTE]
> These 20% rules set the **run's** regression status, which the app shows as a badge. The explain prompts work out their own **Overall** rating from pass-rate bands (Healthy ≥ 95%, Warning 75–95%, Critical < 75%), so the AI summary can rate a run differently from its badge. For example, 14 passed and 4 failed is **Critical** by the 20% rule (22% failed) but **Warning** in the AI summary (77.8% passed). The two prompts calculate the pass rate differently:
>
> - **Explain Copilot Studio Assessment:** pass ÷ (pass + fail + error). Errors count as not passed.
> - **Explain Copilot Agent Kit Assessment:** passed ÷ (passed + failed + pending). Errors are left out.
>
> The Kit flow gives its prompt a verdict (Baseline, Regression Detected, No Regression (existing failures) or No Regression) rather than the Healthy / Warning / Critical status.

### 5.2 Copilot Credits

| Item | Behavior |
|---|---|
| Credits per run | Recorded **only for agents on the GitHub Copilot harness**, from the `consumption` data that Copilot Studio returns with each evaluation run. Stored as *Conversation Credits* (answering) and *Evaluator Credits* (scoring). |
| Partial credits | If Copilot Studio reports a partial total, the run is flagged **Credits Partial**. |
| Kit tests | Kit tests don't report Copilot Credits. |

---

## 6. AI Prompts

All three are AI Builder prompts that ship in the solution.

| Prompt | Model | Called by | Output |
|---|---|---|---|
| Explain Copilot Studio Assessment | GPT-5 reasoning | Flow 1 | Text → *Overall AI Analysis* |
| Explain Copilot Agent Kit Assessment | GPT-5 reasoning | Flow 2 | Text → *Kit AI summary* and *Overall AI Analysis* |
| Recommend Model from Assessment Comparison | GPT-4.1, temperature 0 | Makers app (Compare dialog) | JSON: verdict, confidence, headline, reasons, trade-offs, caveats |

If the Copilot Studio explain prompt fails, the evaluation run still finishes; only the AI analysis is missing.

### 6.1 Explain Copilot Studio Assessment

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

### 6.2 Explain Copilot Agent Kit Assessment

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

### 6.3 Recommend Model from Assessment Comparison

This prompt **explains** a decision; it doesn't make it. The Makers app computes the verdict and confidence in code, so the same two runs always get the same verdict. The prompt runs at temperature 0 and writes the headline, reasons, trade-offs and caveats around that decision.

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

#### What is a shared check?

To compare two models fairly, the recommendation only compares like with like. A **shared check** is a check (one metric of one test case, or one Kit test) that got a **Pass** or a **Fail** in **both** selected runs. Each shared check is a row in the **Test runs** tab where both run columns show Pass or Fail.

A check is **not** shared when either run:

- didn't run it, for example because a test case was added after the first run;
- returned an **Error**, so there's no answer to judge;
- has an **Excluded**, pending or unknown result.

Example. Run A and run B each ran five checks:

| Check | Run A | Run B | Shared? |
|---|---|---|---|
| Q1 · Relevance | Pass | Pass | ✅ Both passed |
| Q2 · Relevance | Pass | Fail | ✅ Only A passed |
| Q3 · Relevance | Fail | Pass | ✅ Only B passed |
| Q4 · Relevance | Pass | Error | ❌ B has no result to judge |
| Q5 · Relevance | Not run | Pass | ❌ A didn't run it |

There are 3 shared checks. Run A passed 2 of them (67%), and run B passed 2 of them (67%). Q4 and Q5 are left out of the pass rates, but they are counted as errors and as checks only one run covered. That can lower the confidence. Comparing only shared checks stops a model looking better just because it ran fewer or easier tests.

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

## 7. Data Model

| Table | Purpose | Key columns |
|---|---|---|
| **Tracked Agent** (`cat_trackedagent`) | One row per agent being followed | Copilot Agent ID, Current Model (last assessed), Source Status, Run Kit tests, Kit agent configuration, test set |
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

**Regression status:** Not Assessed, Healthy, Warning, Critical (see [5.1](#51-regression-status)).
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
