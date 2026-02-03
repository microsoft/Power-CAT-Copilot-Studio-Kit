# Rubrics Refinement Overview

## What is Rubrics Refinement?

Rubrics Refinement is a powerful capability in Copilot Studio Kit that enables you to create, test, and iteratively improve reusable evaluation standards (rubrics) for AI-generated responses. This feature helps ensure that AI grading of your copilot's responses aligns with human judgment and organizational quality standards.

## The Problem It Solves

AI judges are capable evaluators, but the quality of their grading depends entirely on the rubric they are given. Without a systematic way to refine evaluation criteria, organizations struggle to:

- Define clear, domain-specific evaluation standards
- Compare AI grading with human expectations
- Identify where rubric instructions fail to capture intended quality criteria
- Build trust in AI evaluation outputs for critical enterprise use cases

Rubrics Refinement addresses these challenges by providing an iterative workflow that brings AI grading into alignment with human judgment.

## Key Benefits

- **Reusable Evaluation Standards**: Define rubrics once and reuse them across multiple agents and test runs
- **Alignment with Human Judgment**: Systematically minimize misalignment between AI and human graders
- **Quality Assurance**: Establish durable enterprise assets that encode organizational quality standards
- **Accelerated Time to Market**: Eliminate ad-hoc evaluation processes with structured, repeatable workflows
- **Confidence in AI Evaluation**: Build trust in automated grading through transparent, iterative refinement

## Core Concepts

### Rubrics as Evaluation Standards

A **rubric** is a structured set of natural-language grading instructions used by an AI judge to evaluate the quality of an agent's response. A rubric includes:

- A description of "what a good response looks like"
- Grade definitions for a 5-point scale (5 = Exemplary → 1 = Needs improvement)
- Optional good and bad examples that illustrate quality standards

### AI Grading vs Human Grading

- **AI Grading**: An AI judge (LLM) evaluates responses using the rubric, producing a grade (1-5) and a rationale explaining its assessment
- **Human Grading**: A human evaluator (maker) assesses the same responses, providing their own grade (1-5) and reasoning
- **Comparison**: By comparing these two assessments, you can identify where the rubric needs refinement

### Alignment and Misalignment

- **Alignment**: When the AI grade matches the human grade, the rubric is working as intended
- **Misalignment**: When the AI grade differs from the human grade, it indicates the rubric needs improvement
- **Alignment Percentage**: The proportion of test cases where AI and human grades match, calculated as:

  ```
  Alignment % = (Number of aligned grades / Total graded test cases) × 100%
  ```

### The Iterative Refinement Process

Rubrics Refinement is fundamentally an iterative process:

1. **Define** an initial rubric with evaluation criteria
2. **Run** tests using the rubric to generate AI grades
3. **Review** agent responses and provide human grades
4. **Compare** AI and human assessments to identify misalignment
5. **Mark** good/bad examples to guide refinement
6. **Refine** the rubric using AI analysis of misalignment patterns
7. **Re-run** tests with the updated rubric
8. **Repeat** until alignment is acceptable

## Primary Goal

> **Important**: The goal of rubric refinement is **not** to get all responses graded as 5 (Exemplary). The goal is to **minimize misalignment** between AI and human graders.

Response optimization—actually improving the quality of your copilot's answers—happens in Copilot Studio itself. Rubrics Refinement focuses purely on ensuring your evaluation criteria accurately reflect human judgment, so you can trust automated grading results.

## Two Modes of Rubric Usage

Rubrics in Copilot Studio Kit serve two distinct purposes:

### 1. Testing Mode (Test Case Level)
- **Purpose**: Regular test automation with custom grading criteria
- **Configuration**: Assign rubric at the individual test case level
- **Use Case**: Ongoing quality assurance for Generative Answer test cases
- **Pass/Fail**: Grade ≥ passing grade threshold (default: 5)

### 2. Refinement Mode (Test Run Level)
- **Purpose**: Iteratively refine and improve the rubric itself
- **Configuration**: Assign rubric at the test run level
- **Use Case**: Dedicated rubric refinement workflow
- **Pass/Fail**: Passing grade is informational only—the goal is alignment, not passing scores
- **Key Difference**: AI provides detailed rationale (more expensive) to support analysis

## Who Should Use Rubrics Refinement?

Rubrics Refinement is ideal for:

- **Quality Assurance Teams**: Establishing consistent evaluation standards across copilots
- **Makers**: Creating reliable automated tests for Generative Answer responses
- **Enterprise Organizations**: Defining domain-specific, organizational quality standards
- **Anyone Seeking Trust in AI Evaluation**: Teams that need confidence in automated grading for critical use cases

## What's Included in the Current Release

The current release (MVP/P0) includes:

- Complete rubric management (create, view, edit, duplicate, delete)
- Rubric assignment at test run level (for refinement) and test case level (for testing)
- Passing grade selection with clear differentiation between testing and refinement modes
- Two refinement views: standard (AI grades hidden) and full (AI grades visible)
- Detailed view for grading longer responses
- Ability to mark test cases as good/bad examples
- AI-powered rubric refinement based on alignment analysis
- Save and save-as options for preserving rubric versions
- Support for iterative refinement workflow

## What's Coming in Future Releases

Future enhancements (P1/P2) will include:

- Auto-generate rubrics from descriptions
- Auto-generate test sets from conversation transcripts
- Misalignment pattern clustering
- Enhanced diagnostics and analytics
- Rubric governance (approvals, lifecycle, publishing)
- Export rubrics to Copilot Studio custom grader format
- Enhanced dedicated rubric refinement dashboard

## Getting Started

To begin using Rubrics Refinement:

1. **Create a rubric** defining your quality standards (see [Rubric Management](02-rubric-management.md))
2. **Prepare test cases** with Generative Answer test types
3. **Configure a test run** for rubric refinement (see [Using Rubrics in Tests](03-using-rubrics-in-tests.md))
4. **Follow the refinement workflow** to align AI with human judgment (see [Rubric Refinement Workflow](04-rubric-refinement-workflow.md))

---

**Next**: [Rubric Management →](02-rubric-management.md)
