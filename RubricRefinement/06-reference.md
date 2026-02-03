# Reference

## Grade Scale Definitions

The standard 5-point scale used in all rubrics:

| Grade | Label | General Meaning |
|-------|-------|----------------|
| **5** | **Exemplary** | Fully satisfies all expectations; professional and polished; no improvements needed; ready for use |
| **4** | **Strong** | Meets all major requirements with minor areas for improvement; high quality overall; mostly ready |
| **3** | **Acceptable** | Meets minimum expectations but lacks depth or polish; functionally adequate; needs enhancement |
| **2** | **Weak** | Contains meaningful gaps in quality, structure, or relevance; needs significant improvement |
| **1** | **Needs Improvement** | Does not meet expectations; major issues with accuracy, relevance, tone, or completeness |

---

## Alignment Calculation Formula

### Individual Test Case Alignment

For each test case:
```
Aligned = (AI Grade == Human Grade)
Misaligned = (AI Grade ≠ Human Grade)
```

### Aggregate Alignment Percentage

For a test run:
```
Alignment % = (Number of aligned test cases / Total graded test cases) × 100%
```

**Example Calculation**:
- Total test cases with human grades: 30
- Test cases where AI grade = Human grade: 24
- Alignment % = 24 / 30 × 100% = **80%**

### Directional Misalignment Analysis

```
AI Too Lenient = Count of (AI Grade > Human Grade)
AI Too Strict = Count of (AI Grade < Human Grade)
Net Bias = (AI Too Lenient - AI Too Strict) / Total Misaligned Cases
```

**Example**:
- AI grade > Human grade: 3 cases (AI too lenient)
- AI grade < Human grade: 3 cases (AI too strict)
- Net Bias = (3 - 3) / 6 = 0 (no systematic bias)

---

## Sample Rubric 1: Investor Relations Report

### What Good Response Looks Like

Evaluate the submitted answer against the expert answer (or expected standard) across IR-specific communication qualities:

- **Clarity**: Is information communicated clearly and logically?
- **Relevance**: Does the content match what investors expect?
- **Completeness**: Are key business drivers & metrics included?
- **Coherence & Narrative Quality**: Is the story cohesive and readable?
- **Professional Tone**: Does the answer sound like polished IR output?
- **Insightfulness**: Does it highlight meaning, drivers, risks?
- **Accuracy vs. Expectation**: Does it stay aligned with what an IR team would consider acceptable (not necessarily factuality-judging)?

### Grade Definitions

#### 5 — Excellent / Professional IR Quality

The response:
- Fully satisfies the expectations of an IR report
- Well-structured, polished, and investor-ready
- Includes all major elements: KPIs, performance drivers, commentary, forward-looking insights (if appropriate), and strategic context
- Tone is professional, consistent with corporate IR voice
- Narrative flows logically, with crisp, concise explanations
- No irrelevant details; high investor usefulness

#### 4 — Strong / High Quality

The response:
- Covers all major content areas relevant to investors
- Mostly well-organized with minor gaps or slight redundancy
- Tone is professional, though maybe less polished than score 5
- Provides useful insights and commentary
- Some room to improve tightness, clarity, or emphasis on key drivers

#### 3 — Adequate / Meets Minimum IR Expectations

The response should:
- Communicates correct and sensible content but lacks depth or polish
- Missing one or two key IR elements (e.g., context for results, drivers, or risks)
- Narrative may feel mechanical or generic
- Tone is acceptable but not as polished or investor-friendly
- Provides basic information but limited insight

#### 2 — Weak / Partially Suitable

The response:
- Contains meaningful gaps in narrative, structure, or relevance
- Misses important investor-relevant components like metrics, drivers, or business context
- Tone may be inconsistent or too casual
- Organization may feel scattered or unclear
- Provides little real value to an investor or IR professional

#### 1 — Poor / Not Suitable for IR Use

The response:
- Misses most expectations of an IR report
- Unstructured, confusing, or irrelevant to investor needs
- Tone is unprofessional, overly casual, or marketing-like
- Lacks metrics, drivers, explanations — or includes misleading framing
- Does not reflect IR communication standards

---

## Sample Rubric 2: Business Summaries / Status Report Generation

### What Good Response Looks Like

Evaluate the submitted report on how well it matches the expected tone and style, including:

- **Professionalism**: Does it maintain a business-appropriate tone?
- **Consistency**: Does the tone remain uniform throughout?
- **Voice Alignment**: Does it sound like the company / team / IR department?
- **Formality**: Does the formality level match the report type (e.g., IR = high, IT weekly = medium)?
- **Clarity & Directness**: Is it concise, crisp, without fluff?
- **Stylistic Compliance**: Does it follow expected patterns—bullet structure, executive summary style, tense usage, etc.?
- **Avoidance of Bias / Emotion**: No slang, hype language, or marketing-y tone unless explicitly requested

### Grade Definitions

#### 5 — Excellent (Consistent, Professional, On-Brand)

The report:
- Maintains a fully consistent tone throughout
- Matches the expected corporate/IR/IT voice precisely
- Uses professional, polished, confident language
- Follows style conventions: structured paragraphs, clear bullets, measured phrasing
- Avoids hype, exaggeration, casualness, and emotional language
- Reads as if written by an experienced corporate communicator

#### 4 — Strong (Minor Variations but High Quality)

The report:
- Matches the expected tone almost perfectly with slight drift
- Mostly consistent phrasing, with small spots of over-verbosity or informality
- Follows most style conventions, though could be tightened
- No unprofessional language, but might use slightly generic or weaker phrasing

#### 3 — Adequate (Acceptable but Not Fully Consistent)

The report:
- Shows noticeable variation in tone across sections
- Style is mostly correct but occasionally informal, overly casual, or slightly marketing-like
- May deviate from expected company voice
- Structure is acceptable but somewhat inconsistent (mixed bullet formats, uneven formality)
- Still professional enough to understand but not investor- or executive-ready

#### 2 — Weak (Tone Issues Affect Professionalism)

The report:
- Frequently inconsistent tone; may mix formal and casual language
- Uses conversational or "chatty" phrasing inappropriate for reports
- Shows stylistic inconsistencies—run-on sentences, messy bulleting, informal transitions
- Tone may come across as marketing-like, emotional, or vague
- Does not adhere well to the expected style guide

#### 1 — Poor (Not Appropriate for Report Use)

The report:
- Strongly mismatched tone—too casual, emotional, hype-y, or unclear
- No consistent style; lacks structure
- Tone undermines credibility or professionalism
- May include slang, emojis, dramatization, or narrative storytelling inappropriate for reports
- Reads like a casual email or blog post, not a formal report

---

## Evaluation Themes / Criteria

Common evaluation dimensions that can be used across different rubrics. Select the themes most relevant to your use case.

| Eval Criterion | Definition | When to Use | Sample User Input | Expected Response |
|----------------|------------|-------------|-------------------|-------------------|
| **Accuracy** | Information is factually correct or data from the groundtruth source (Q&A, retrieval, reports). | When factual correctness is essential (e.g., financial data, technical specs). | Questions with verifiable answers (e.g., "What is the RTD policy?") | Factually correct answers; all details accurate. |
| **Groundedness / Faithfulness** | Response is based only on provided knowledge or retrieved data; no hallucination. | When agent synthesizes or references KB content. | Prompts requiring evidence or citations. | Grounded responses with citations; no made-up facts. |
| **Completeness** | Response addresses all parts; sections; or steps of a task. | When output should include multiple parts (how-to, report generation). | Multi-part questions or prompts (e.g., onboarding steps). | Response addresses all required elements. |
| **Relevance** | Information should be specific to the user query and stay on topic. | When output scope must be narrow (e.g., single policy). | Prompts with focused intent. | Concise, targeted responses; excludes unrelated info. |
| **Consistency** | Agent provides the same output for equivalent or repeated queries. | Always evaluate for QA and determine "Always evaluate for QA and determine repeatability." | Repeated queries. | Identical or near-identical answers. |
| **Clarity & Coherence** | Output is clearly written, logically structured, and easy to understand. | Always for generation; ensures human readability. | Any content generation prompt. | Grammatically correct, coherent, flowing text. |
| **Terminology / Compliance** | Consistent use of required terminology or phrasing standards. | When brand or domain language matters (e.g., HR, legal). | Prompts specifying naming or phrasing rules. | Correct, compliant terms. |
| **Citation / Traceability / Accountability** | Agent correctly points a user back to its correct source. | When credibility or traceability is required. | Queries needing evidence-based answers. | Citations match correct sources. |
| **Formatting & Presentation** | Adheres to specific structure or layout (tables, sections). | When agent produces formatted outputs (e.g., summaries, reports). | Prompts requiring structured outputs. | Correct headings, bullet styles, layout. |
| **Context Awareness** | Response is tailored to user's persona, intent, or query context. | For personalized or contextual queries (e.g., role-specific). | Prompts differing by role or context. | Context-specific, personalized responses. |
| **Hallucination-Free** | Agent should not invent facts beyond provided data. | When source coverage is limited or sensitive. | Out-of-scope prompts. | "I don't know" or safe fallback response. |

### How to Use Evaluation Themes

1. **Select 3-5 relevant themes** for your rubric
2. **Define what each theme means** in your domain
3. **Incorporate into grade definitions** (e.g., Grade 5 must excel in all themes)
4. **Use as a checklist** when providing human grades

**Example Application**:

For an IR Report rubric, prioritize:
1. **Accuracy** (critical)
2. **Completeness** (critical)
3. **Clarity & Coherence** (important)
4. **Terminology / Compliance** (important)
5. **Formatting & Presentation** (nice to have)

---

## Glossary of Terms

### Rubric
A structured set of natural-language grading instructions used by an AI judge to evaluate the quality of an agent's response. A rubric defines the criteria, expectations, examples, and scoring scale (1-5) that determine what constitutes a "good" or "bad" response for a specific domain or use case.

### Rubric Refinement
An iterative process of improving the clarity, specificity, and effectiveness of a rubric based on observed alignment or misalignment between human judgment and AI judgment. Refinement includes updating instructions, adding examples, and re-running tests until evaluation behavior aligns with domain expectations.

### LLM Judge / AI Judge / AI Evaluator
A large language model used to evaluate an agent's response according to a rubric. The judge produces a score (1-5) and optionally a rationale explaining how the rubric criteria were interpreted and applied.

### Human Judgment / Human Annotation
A maker's evaluation of an agent's response, consisting of a grade (1-5) and reasoning. Human judgments act as the "gold standard" against which AI judge behavior is compared during rubric refinement.

### Alignment / Misalignment
The degree to which the AI judge's evaluation matches the human judgment.
- **Alignment**: AI grade = Human grade (indicates rubric is working as intended)
- **Misalignment**: AI grade ≠ Human grade (indicates rubric needs refinement)

### Alignment Percentage
The proportion of test cases where AI and human grades match, calculated as:
```
(Number of aligned grades / Total graded test cases) × 100%
```

### Good Example / Bad Example
Real test cases selected by the maker to illustrate desired or undesired response patterns. Examples include the test utterance, agent response, and designation (good/bad). Used during rubric refinement to provide concrete guidance to the AI judge.

### Passing Grade
The minimum acceptable grade (1-5) for a test case to be considered "passed."
- **Testing Mode** (test case level): Determines actual pass/fail result
- **Refinement Mode** (test run level): Informational indicator only; goal is alignment, not passing

### Testing Mode (Test Case Level Rubric)
Using a rubric at the individual test case level for regular quality assurance. AI provides grade only (no rationale) for cost-efficiency. Pass/fail is determined by whether grade ≥ passing grade threshold.

### Refinement Mode (Test Run Level Rubric)
Using a rubric at the test run level specifically for iterative rubric refinement. AI provides grade + detailed rationale. Non-Generative Answer test types are skipped. Goal is to minimize misalignment between AI and human grades.

### Generative Answer Test (GA Test)
A test type in Copilot Studio Kit where the agent generates natural-language responses (using generative orchestration) that are evaluated against provided validation instructions or a rubric.

### Test Set
A collection of one or more test cases executed together. In refinement mode, the same rubric applies to all Generative Answer test cases in the set.

### Test Run
A single execution of a test set, producing results that include agent responses, AI grades, human annotations (in refinement mode), and alignment indicators.

### Test Case
An individual test within a test set, consisting of a test utterance (user input), expected behavior, and validation criteria (standard validation or rubric-based grading).

### AI Grade / AI Score
The numeric rating (1-5) assigned by the AI judge based on rubric criteria.

### AI Rationale / AI Reasoning
The detailed explanation provided by the AI judge (in refinement mode) explaining why a specific grade was assigned and which rubric criteria were applied.

### Groundedness
A quality measure indicating whether an AI-generated response is firmly supported by the source information provided (e.g., retrieved documents, system messages, or defined facts). A grounded response does not introduce information that cannot be traced back to a known authoritative source.

### Faithfulness
Similar to groundedness but emphasizing that the model does not fabricate or hallucinate new facts beyond what the rubric or provided context allows.

### Recency (Temporal Accuracy)
A criterion evaluating whether the response reflects information that is chronologically accurate or up to date. Particularly relevant for time-sensitive content (e.g., events, dates, schedules, availability).

### Relevance
A measure of how directly and appropriately the agent's response addresses the user's query. A response is relevant if it stays within the scope of the question and avoids unnecessary or distracting information.

### Correctness / Accuracy
A criterion assessing whether the agent's response is factually correct based on the expected or reference answer, authoritative knowledge, or system-provided content.

### Completeness
A measure of whether the response fully addresses all parts of the user's query. A complete response covers each required element without omissions.

### Reasoning Quality
An evaluation of whether the response demonstrates coherent thinking, logical steps, justification, and correct interpretation of the problem.

### Standard Refinement View
The rubric refinement interface view that **hides AI grades and rationale** to prevent bias when providing human judgments. Used for initial review and unbiased grading.

### Full Refinement View
The rubric refinement interface view that **shows AI grades and rationale** alongside human grades, with alignment indicators. Used for comparing assessments and analyzing misalignment patterns.

### Detailed View
A focused interface for reviewing and grading individual test cases with longer responses. Includes full conversation context and tabs for "Refinement" (AI hidden) and "Refinement (full)" (AI visible).

### Validation Instructions
Text-based instructions used in standard Generative Answer tests to specify what makes a response acceptable. Mutually exclusive with rubric-based grading—when a rubric is selected, validation instructions are hidden or ignored.

### Custom Grader (Copilot Studio)
A future Copilot Studio feature that will allow makers to define custom evaluation logic for copilot responses. Rubrics refined in Copilot Studio Kit are designed to be compatible with this system (future integration).

### Maker
A user of Copilot Studio Kit who creates, tests, and manages copilots and evaluation rubrics. In the context of rubric refinement, the maker provides human judgments that serve as the evaluation standard.

### Agent
The copilot or AI assistant being tested. In rubric refinement, the agent generates responses that are evaluated by both AI judges and human makers.

### Iterate / Iteration
A single cycle of the rubric refinement process: run → review → grade → refine → save → re-run. Multiple iterations are typically needed to achieve acceptable alignment.

### Directional Bias
A systematic pattern where the AI judge consistently grades higher (too lenient) or lower (too strict) than human judges. Identified by comparing counts of (AI > Human) vs (AI < Human) misalignments.

### Magnitude of Misalignment
The numeric difference between AI and human grades. Off by 1 point is minor misalignment; off by 2+ points indicates more significant issues requiring refinement.

### Overfitting
When a rubric becomes too specific to the test cases used during refinement and fails to generalize to new, unseen responses. Avoided by limiting iterations and testing with fresh test cases.

### Test Run Level Rubric Override
When a rubric is selected at the test run level, it applies to all Generative Answer test cases in that run, overriding any rubrics assigned at the individual test case level.

---

## Quick Reference: Refinement Workflow Steps

1. **Start Run**: Configure test run with rubric (test run level) + passing grade → Execute
2. **Review**: Open Standard Refinement View (AI hidden)
3. **Grade**: Provide human grades (1-5) + reasoning for all test cases
4. **Mark Examples**: Toggle "Marked as Example" for 6-10 good/bad cases
5. **Analyze**: Switch to Full Refinement View; review AI grades/rationales; calculate alignment
6. **Refine**: Click "Refine Rubric" → AI analyzes patterns → Updates rubric
7. **Save**: Save (overwrite) or Save As (new version)
8. **Re-run**: Duplicate test run → Execute with refined rubric
9. **Repeat**: Continue until alignment is 80-90%+

---

## Quick Reference: Testing vs Refinement Mode

| Aspect | **Testing Mode** | **Refinement Mode** |
|--------|------------------|---------------------|
| **Rubric Level** | Test case | Test run |
| **Purpose** | Quality assurance | Rubric improvement |
| **AI Output** | Grade only | Grade + rationale |
| **Cost** | Lower | Higher |
| **Passing Grade** | Determines pass/fail | Informational only |
| **Goal** | Identify low-quality responses | Minimize AI-human misalignment |
| **Non-GA Tests** | Run normally | Skipped |
| **Human Grading** | Not required | Required for refinement |

---

## Quick Reference: Grade Selection Guide

| Passing Grade | When to Use | Pass Rate Expectation |
|---------------|-------------|----------------------|
| **5 (Exemplary)** | Critical communications (IR, executive, legal) | Low pass rate; only best responses pass |
| **4 (Strong)** | Professional business communications | Moderate pass rate; high-quality responses pass |
| **3 (Acceptable)** | Internal tools, minimum functionality | High pass rate; functional responses pass |
| **2 (Weak)** | Very low bar (rarely appropriate) | Very high pass rate |
| **1 (Needs Improvement)** | Almost never used | Nearly all responses pass |

**Recommendation**: Default to passing grade **5** for refinement mode. Adjust to **4** or **5** for testing mode based on your quality standards.

---

**Previous**: [← Best Practices](05-best-practices.md) | **Next**: [Future Enhancements →](07-future-enhancements.md)
