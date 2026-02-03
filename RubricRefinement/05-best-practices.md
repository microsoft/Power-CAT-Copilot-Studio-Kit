# Best Practices & Tips

## Rubric Design Guidelines

### 1. Be Domain-Specific

Generic rubrics produce poor alignment. Write for your specific use case.

❌ **Too Generic**:
```
What good looks like: A helpful, accurate response
Grade 5: Excellent response
Grade 1: Bad response
```

✅ **Domain-Specific**:
```
What good looks like: A professional investor relations response that includes
relevant financial metrics, explains business drivers, maintains formal tone,
and provides forward-looking context appropriate for shareholder communications.

Grade 5 (Exemplary): Includes all key IR elements (KPIs, performance drivers,
strategic context, forward-looking insights), maintains polished professional
tone, flows logically, and requires no improvements.
```

### 2. Use Observable, Measurable Criteria

Avoid subjective terms that can be interpreted differently by different evaluators.

❌ **Subjective**:
```
Grade 5: Response feels right and sounds professional
Grade 3: Response is okay but could be better
```

✅ **Observable**:
```
Grade 5: Response includes specific metrics with context, explains causal
relationships, uses industry-standard terminology, follows structured format
(intro-body-conclusion), and avoids jargon.

Grade 3: Response includes basic metrics but lacks context, provides minimal
explanation of drivers, uses acceptable but generic language, and has some
organizational gaps.
```

### 3. Create Clear Grade Distinctions

Each grade level should have clear, distinguishable characteristics.

**Technique: Use Progressive Specificity**
- Grade 5: All criteria + polish + no gaps
- Grade 4: All criteria + minor gaps or less polish
- Grade 3: Core criteria met + noticeable gaps
- Grade 2: Missing key criteria + significant issues
- Grade 1: Fails to meet expectations

**Example**:
```
Grade 5: Includes metrics, drivers, context, and forward insights; professional
         tone; logical flow; investor-ready polish
Grade 4: Includes metrics, drivers, and context; mostly professional tone;
         generally logical flow; minor polish needed
Grade 3: Includes metrics and basic context; acceptable tone but generic;
         functional but lacks depth
Grade 2: Missing key metrics or context; inconsistent tone; gaps in logic
Grade 1: Missing most expected elements; unprofessional tone; confusing structure
```

### 4. Focus on Multiple Quality Dimensions

Consider all relevant aspects of quality:

| Dimension | Questions to Address |
|-----------|---------------------|
| **Accuracy** | Is the information correct and factual? |
| **Completeness** | Are all necessary elements included? |
| **Relevance** | Does it address the specific query? |
| **Groundedness** | Is it supported by source material? |
| **Tone** | Is the style appropriate for the audience? |
| **Clarity** | Is it easy to understand? |
| **Structure** | Is it well-organized? |
| **Context** | Does it provide necessary background? |
| **Professionalism** | Does it meet business communication standards? |

You don't need to address all dimensions in every rubric—focus on what matters for your use case.

### 5. Lead with What Matters Most

Put the most important criteria first in your grade definitions.

✅ **Good Prioritization**:
```
Grade 5:
• [Most critical] Accuracy: All facts correct and grounded in source material
• [Very important] Completeness: Includes all required metrics and context
• [Important] Tone: Professional and appropriate for IR communications
• [Nice to have] Polish: Well-structured with logical flow
```

This helps both human and AI evaluators focus on what truly matters.

### 6. Avoid Redundancy Across Grades

Don't repeat the same language for every grade level.

❌ **Redundant**:
```
Grade 5: Professional tone, includes metrics, provides context
Grade 4: Professional tone, includes metrics, provides context
Grade 3: Professional tone, includes metrics, provides context
```

✅ **Progressive**:
```
Grade 5: Polished professional tone, comprehensive metrics with deep context
Grade 4: Professional tone, key metrics with adequate context
Grade 3: Acceptable tone, basic metrics with minimal context
```

### 7. Include Rationale for Standards

Explain why certain criteria matter, especially for non-obvious standards.

**Example**:
```
Tone should be professional and consistent with corporate IR voice because
investor communications must maintain credibility and trust. Casual or
marketing-like language undermines confidence in financial reporting and
may violate regulatory expectations.
```

This helps both AI and human evaluators understand the "why" behind standards.

---

## How Many Test Cases for Refinement?

### Minimum Viable Set
- **15-20 test cases** minimum for initial refinement
- Enough variety to cover different query types and response patterns
- Balance between effort and coverage

### Recommended Set
- **30-50 test cases** for robust refinement
- Good statistical representation of alignment
- Covers edge cases and variety

### Large-Scale Set
- **50-100+ test cases** for comprehensive refinement
- Best for critical use cases requiring high confidence
- Provides strong alignment metrics

### Quality Over Quantity
More important than the number:
- **Variety**: Different types of queries and responses
- **Representative**: Reflects real-world usage
- **Edge cases**: Includes challenging or ambiguous scenarios
- **Consistent**: Same test set used across iterations

> **Tip**: Start with 20-30 test cases. Add more if you see high variance in alignment or if test cases are too homogeneous.

---

## When to Iterate vs When to Stop

### Continue Iterating If:
- ✅ Alignment is below 75%
- ✅ Clear patterns of misalignment exist
- ✅ AI consistently misinterprets specific criteria
- ✅ You've identified new examples that could help
- ✅ Alignment improved significantly in the last iteration (momentum)

### Consider Stopping If:
- ✅ Alignment is consistently 80-90%+
- ✅ Remaining misalignment appears random (no patterns)
- ✅ Last 2-3 iterations show minimal improvement
- ✅ Misalignment is minor (off by 1 point) and acceptable
- ✅ Additional iterations cause the rubric to overfit to test cases

### Refinement Stopping Criteria

| Alignment | Recommendation |
|-----------|----------------|
| **90%+** | Excellent—stop and move to testing mode |
| **80-89%** | Very good—1-2 more iterations then stop |
| **75-79%** | Good—continue with 2-3 more iterations |
| **60-74%** | Fair—continue refining; consider rubric redesign if not improving |
| **< 60%** | Poor—major refinement needed or rubric redesign |

### Diminishing Returns

Track alignment improvement across iterations:
- **Iteration 1 → 2**: +15% improvement → Keep going
- **Iteration 2 → 3**: +8% improvement → Keep going
- **Iteration 3 → 4**: +2% improvement → Consider stopping soon
- **Iteration 4 → 5**: +1% improvement → Stop

---

## Avoiding Bias in Human Grading

### The Bias Problem

Human grades can be influenced by:
- **AI grades**: Seeing AI's assessment before forming your own
- **Passing grade expectations**: Wanting responses to pass rather than grading honestly
- **Confirmation bias**: Looking for evidence that supports your initial impression
- **Anchoring**: First response you grade influences subsequent grades

### Strategies to Minimize Bias

#### 1. Use Standard Refinement View First
- Grade in the **Standard Refinement View** (AI hidden)
- Form your own opinion before seeing AI assessment
- Switch to Full View only after completing your grades

#### 2. Reference the Rubric Constantly
- Keep the rubric open while grading
- Explicitly match response to criteria
- Don't rely on gut feeling alone

#### 3. Grade in Batches
- Grade 5-10 test cases at a time
- Take breaks between batches
- Maintain consistent standards across sessions

#### 4. Grade Before Marking Examples
- First pass: Assign grades and reasoning
- Second pass: Mark good/bad examples
- This prevents example selection from influencing grades

#### 5. Ignore Pass/Fail Outcomes
- Remember: Goal is alignment, not passing scores
- Grade honestly based on quality
- A low-quality response should get a low grade even if you wish it were better

#### 6. Use a Grading Checklist
Create a simple checklist for each grade decision:

```
For this response:
□ Did I read the full response before grading?
□ Did I reference the rubric criteria?
□ Did I identify specific strengths and weaknesses?
□ Is my reasoning detailed and specific?
□ Did I avoid being influenced by AI grade?
□ Would I give the same grade tomorrow?
```

#### 7. Calibrate with a Partner
If possible:
- Have a colleague grade a subset of test cases
- Compare your grades to theirs
- Discuss differences and align on standards
- This improves consistency

---

## Writing Effective Reasoning

Your human reasoning is crucial for rubric refinement. The AI analyzes your explanations to understand what matters.

### What Makes Good Reasoning?

✅ **Specific and Detailed**:
```
Grade 4 (Strong): Response includes accurate automotive diagnostic information
and identifies the likely cause (worn brake pads). Provides clear next steps
(inspection and replacement). Tone is professional and reassuring. However,
it lacks specific cost estimates and timeline, which would make it exemplary
for our customer service standards.
```

❌ **Vague and Generic**:
```
Grade 4: Pretty good response. Has most of what's needed.
```

### Elements of Effective Reasoning

1. **Reference Rubric Criteria**:
   - "Includes required metrics" → Which metrics?
   - "Professional tone" → What makes it professional?
   - "Lacks context" → What context is missing?

2. **Explain Your Grade Decision**:
   - Why this grade and not higher/lower?
   - What would make it better (for grades < 5)?
   - What keeps it from being worse (for grades > 1)?

3. **Be Concrete**:
   - Quote specific parts of the response
   - Identify specific missing elements
   - Point to specific quality issues

4. **Address Multiple Dimensions**:
   - Don't focus only on one aspect
   - Comment on accuracy, completeness, tone, structure, etc.

### Reasoning Template

Use this structure:

```
Grade [X] ([Label]):
• Strengths: [What the response does well; which criteria it meets]
• Weaknesses: [What's missing or could be better; which criteria it falls short on]
• Rationale: [Why this grade specifically; what would change it to higher/lower]
```

**Example**:
```
Grade 3 (Acceptable):
• Strengths: Response provides technically accurate information about engine
  overheating causes and mentions checking coolant levels. Tone is appropriate.
• Weaknesses: Missing specific diagnostic steps (how to check coolant, what
  normal levels are). Doesn't address urgency or safety concerns. Lacks
  preventive maintenance advice.
• Rationale: Meets basic functional requirements (Grade 3) but lacks the depth
  and completeness expected for Grade 4. Not Grade 2 because information
  provided is accurate and helpful, just incomplete.
```

---

## Choosing Good Examples

### What Makes a Good Example?

Good examples share these characteristics:
- **Representative**: Typical of responses you'll encounter
- **Clear**: Unambiguously good or bad
- **Instructive**: Teaches something about quality standards
- **Specific**: Illustrates particular criteria or edge cases

### When to Mark as Good Example

✅ Mark as **Good Example** if:
- Response is Grade 5 and exemplifies ideal quality
- Response handles a complex query particularly well
- Response demonstrates specific positive behaviors you want to reinforce
- You want to show what "meeting all criteria" looks like

**Example Scenario**:
```
Test Utterance: "What were our Q3 revenue drivers?"
Response: [Detailed IR-quality response with metrics, drivers, context, and insights]
Your Grade: 5 (Exemplary)
Mark as: Good Example
Why: Perfectly demonstrates all IR criteria; serves as reference point
```

### When to Mark as Bad Example

✅ Mark as **Bad Example** if:
- Response is Grade 1-2 and clearly fails expectations
- Response demonstrates common errors to avoid
- Response shows specific pitfalls (wrong tone, missing key info, poor structure)
- You want to clarify what "not acceptable" means

**Example Scenario**:
```
Test Utterance: "What were our Q3 revenue drivers?"
Response: [Brief, vague response with no metrics or context]
Your Grade: 2 (Weak)
Mark as: Bad Example
Why: Illustrates insufficient depth and missing critical IR elements
```

### When to Mark Misaligned Cases

**Misaligned test cases are often the most valuable examples** because they reveal ambiguity:

| AI Grade | Human Grade | Mark as Example? | Type | Why |
|----------|-------------|------------------|------|-----|
| 5 | 3 | ✅ Yes | Bad Example | AI is too lenient; clarify what's actually required for Grade 5 |
| 2 | 4 | ✅ Yes | Good Example | AI is too strict; show what meets standards |
| 4 | 5 | ⚠️ Maybe | Good Example | Minor misalignment; helps fine-tune Grade 5 criteria |
| 3 | 3 | ❌ No | N/A | Already aligned; example less impactful |

### How Many Examples to Mark?

**Per Iteration**:
- **3-5 Good Examples**
- **3-5 Bad Examples**
- **Total: 6-10 examples per iteration**

**Cumulative** (across all iterations):
- Rubric can accumulate 20-30+ examples
- The AI uses all examples during refinement
- More examples = more guidance, but diminishing returns after ~30

### Balance Good and Bad

Maintain balance:
- Too many good examples → AI becomes too lenient
- Too many bad examples → AI becomes too strict
- Balanced examples → AI learns boundaries

---

## Interpreting Alignment Metrics

### Understanding Aggregate Alignment

**Alignment Percentage** = (Aligned grades / Total graded) × 100%

This metric tells you how often AI and human agree.

### What Alignment Means (and Doesn't Mean)

✅ **High Alignment Indicates**:
- Rubric criteria are clear and consistently applied
- AI interprets the rubric similarly to humans
- Evaluation standards are objective enough for automation

❌ **High Alignment Does NOT Mean**:
- All responses are high quality
- The rubric is perfect for your domain
- No further refinement will ever be needed

### Alignment by Grade Level

Track alignment separately by grade:

| Grade | # Cases | # Aligned | Alignment % |
|-------|---------|-----------|-------------|
| 5 | 8 | 7 | 88% |
| 4 | 10 | 9 | 90% |
| 3 | 7 | 5 | 71% |
| 2 | 3 | 2 | 67% |
| 1 | 2 | 2 | 100% |

**Insights from this example**:
- Grade 3 has lowest alignment → Focus refinement on Grade 3 criteria
- Grades 1-2 and 5 are well-aligned → Less refinement needed
- Grade 4 is highly aligned → Criteria are clear

### Directional Misalignment

Analyze whether AI is too lenient or too strict:

**Example**:
- 5 cases: AI grade > Human grade (AI too lenient)
- 10 cases: AI grade < Human grade (AI too strict)
- 15 cases: AI grade = Human grade (aligned)

**Insight**: AI is systematically too strict → Adjust grade definitions to be more permissive, or add good examples at lower grades.

### Magnitude of Misalignment

Not all misalignment is equal:

| Misalignment | Example | Severity | Action |
|--------------|---------|----------|--------|
| **Off by 1** | AI=4, Human=5 | Minor | Fine-tune language; acceptable for most uses |
| **Off by 2** | AI=3, Human=5 | Moderate | Requires clarification; add examples |
| **Off by 3+** | AI=2, Human=5 | Major | Fundamental misunderstanding; redesign criteria |

---

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Overly Complex Rubrics

**Problem**: Rubric lists 10+ criteria with nuanced distinctions
**Result**: Both humans and AI struggle to apply consistently
**Solution**: Focus on 3-5 key dimensions; simplify language

### Pitfall 2: Subjective Criteria

**Problem**: Criteria like "sounds good" or "feels professional"
**Result**: Low alignment due to interpretation differences
**Solution**: Use observable, measurable criteria

### Pitfall 3: Inconsistent Human Grading

**Problem**: Human grader applies different standards across test cases
**Result**: Refinement can't identify clear patterns
**Solution**: Use grading checklist; reference rubric constantly; grade in focused sessions

### Pitfall 4: Insufficient Examples

**Problem**: No examples or only 1-2 examples
**Result**: AI lacks concrete guidance
**Solution**: Mark 6-10 examples per iteration, balanced good/bad

### Pitfall 5: Overfitting to Test Cases

**Problem**: Too many iterations with same test cases
**Result**: Rubric becomes hyper-specific to training set
**Solution**: After 4-5 iterations, test with fresh test cases

### Pitfall 6: Chasing Perfect Alignment

**Problem**: Continuing to iterate when at 85-90% alignment
**Result**: Diminishing returns; risk of overfitting
**Solution**: Stop at 80-90%; accept some subjectivity

### Pitfall 7: Ignoring AI Rationales

**Problem**: Not reading AI reasoning in Full View
**Result**: Missing insights into how rubric is being interpreted
**Solution**: Review AI rationales for misaligned cases; identify patterns

### Pitfall 8: Testing and Refinement Mode Confusion

**Problem**: Using test case level rubrics when trying to refine
**Result**: No AI rationale available; can't analyze misalignment
**Solution**: Always use test run level rubrics for refinement

---

## Advanced Tips

### Tip 1: Use Multiple Test Sets

Create different test sets for different purposes:
- **Training Set**: Primary set for refinement (30-50 cases)
- **Validation Set**: Fresh cases to test generalization (10-20 cases)

Refine on training set, validate on validation set.

### Tip 2: Version Your Rubrics

Use naming convention:
- `IR Report Rubric v1` (baseline)
- `IR Report Rubric v2` (after iteration 1-2)
- `IR Report Rubric v3 - Final` (production-ready)

### Tip 3: Track Metrics Over Time

Create a simple log:

| Iteration | Date | Alignment % | Key Changes | Notes |
|-----------|------|-------------|-------------|-------|
| v1 | 2026-01-15 | 62% | Initial rubric | AI too lenient on tone |
| v2 | 2026-01-20 | 74% | Clarified tone criteria, added 8 examples | Improvement in Grade 3-4 |
| v3 | 2026-01-25 | 83% | Refined Grade 5 definition | Good enough for production |

### Tip 4: Collaborate on Grading

For critical rubrics:
- Have 2-3 people grade independently
- Compare grades and discuss differences
- Build consensus on standards
- Use consensus grades for refinement

### Tip 5: Test Rubrics Across Agents

Once refined:
- Test the same rubric on different agents/copilots
- Ensures rubric is generalized, not agent-specific
- Validates that rubric measures quality, not agent behavior

---

## Checklist: Ready to Move to Testing Mode?

Before deploying a rubric at test case level for regular testing, ensure:

- ✅ Alignment is 80%+ on refinement test set
- ✅ Tested on fresh test cases (not used in refinement) with similar alignment
- ✅ Grade definitions are clear and specific
- ✅ Rubric includes 10-20+ good/bad examples
- ✅ No systematic bias (AI not consistently too lenient or strict)
- ✅ Misalignment magnitude is mostly ±1 grade (acceptable variation)
- ✅ Stakeholders agree rubric reflects organizational standards
- ✅ Documentation exists on rubric purpose and usage

If all checked, you're ready to use the rubric for regular testing!

---

**Previous**: [← Rubric Refinement Workflow](04-rubric-refinement-workflow.md) | **Next**: [Reference →](06-reference.md)
