# Running tests in Power CAT Copilot Studio Kit

**Test Runs** allow to execute multiple **Tests** contained in a single test set against a specific **Agent Configuration**.

## Creating a Test Run

1. Open the Power CAT Copilot Studio Kit application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app))
2. Navigate to **Test Runs**.
3. Create a **New** Agent Test Run record.
4. Provide a **Name**.
5. Select the desired **Agent Test Set**.
6. Select the desired **Agent Configuration**;
7. **Save**.

## Understanding what happens when a test runs

When saving a **Test Run** record, a few things happens sequentially:
1. A first cloud flow triggers, and runs all the tests against the specified agent configuration.
2. The **Run Status** moves from **Not Run** to **Running**.
3. Individual **Test Results** are created for each **Test**.
4. When it has finished running, the **Run Status** updates to **Complete**.
5. In case of **Error**, a link to the failed cloud flow is provided for further troubleshooting.
  
When the Run Status reaches **Complete**, additional cloud flows may kick-in, depending on the configuration:
1. **App Insights Enrichment Status** is set to **Pending** until the data becomes available in App Insights. It then updates to **Running** and **Complete** when done.
2. **Generated Answers Analysis** is set to **Pending** if App Insights Enrichment Status is configured so it runs after it. It then updates to **Running** and **Complete** when done.
3. **Dataverse Enrichment Status** is set to **Pending** until conversation transcript becomes available in Dataverse. It then updates to **Running** and **Complete** when done.

## Duplicating a Test Run

Users can quickly re-run the exact same set by clicking on the Duplicate Run command.
This creates a copy of the record that immediately runs.

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/cca5ee96-8b41-42a4-a7e4-4d8d104493f2)

## Rerunning a specific step

Users may rerun a specific child flow
- Enrich with App Insights
- Analyze with AI Builder
- Enrich with Dataverse
- Update Rollup Columns

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/cd8cd44a-5e77-4a49-8c7b-cedfd0273153)

## Next step
- [Analyze test results](./ANALYZE_TEST_RESULTS.md)


