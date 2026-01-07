# Problem Statement

When testing Copilot Studio agents that integrate with external data sources like SharePoint, Dataverse, etc., the agent presents a connection popup "Connect to continue" before accessing the data source. This popup requires the user to click "Allow" to proceed.

<img width="646" height="484" alt="image" src="https://github.com/user-attachments/assets/79229ed1-0e4a-4942-bcb8-f5b1fa6e1461" />



**Challenge:** How do users execute test cases within Copilot Studio Kit to handle this authorization flow and test agent responses that require connector permissions?

---

## Scenario

Consider the following user journey:

| Step | User Action                            | Agent Response                    |
| :--: | -------------------------------------- | --------------------------------- |
|  1   | User says: "List Fourth Coffee Brands" | Agent shows authorization card    |
|  2   | User clicks "Allow"                    | Agent retrieves and displays data |

---

## Solution: Step-by-Step Guide

> **Note:** This is a one-time activity. Once the connection is authorized, you can create normal test cases without repeating this process.

## Multiturn Test Set

Below is the list of test cases which we are going to create and execute as part of Multiturn test.

| Test # | Test Type   | Order | Operation Type      | Test Utterance / Action   | Comparison    | Expected Value                 |
| :----: | ----------- | :---: | ------------------- | ------------------------- | ------------- | ------------------------------ |
| Test 1 | Attachments |   1   | Comparison Operator | List Fourth Coffee Brands | Equals        | [] → Update with captured JSON |
| Test 2 | Attachments |   2   | Invoke Actions      | Adaptive Card Payload     | Contains Data | (Optional)                     |

### Step 1: Create Test Set

1. Click **+ New Test Set**
2. Enter **Name:** Connection Authorization Flow (Name can be anything)

### Step 2: Add Multi-Turn Test

1. Click **+ New Agent Test**
2. Enter suitable **Name**
3. Select Test Type as Multi-Turn and click on Save button
<img width="1699" height="569" alt="image" src="https://github.com/user-attachments/assets/5a7cc192-d105-4a55-8ab7-c35d95d26179" />



### Step 3: Add Multiturn Child Tests

1. Within Multi-Turn test subgrid, click **+ New Agent Test**
2. Configure as follows (this depends on the test utterance you are using; it can be anything.):

| Field                    | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| Test Type                | Attachments (Adaptive Cards, etc.)                     |
| Order                    | 1                                                      |
| Test Utterance           | List Fourth Coffee Brands (can be your test utterance) |
| Operation Type           | Comparison Operator                                    |
| Comparison Operator      | Equals                                                 |
| Expected Attachment JSON | [] (Keep empty for now)                                |

3. Click **Save Test**

### Step 4: Save Test Set and Execute Initial Run

1. Click **Save Test Set** & Execute it
3. Wait for test execution to complete

**Expected Results:**

- Test 1: ❌ FAILED (Expected - we need to capture the JSON)

### Step 5: Capture JSON from Test Results

1. Navigate to Agent Test Run results
2. Click on Multi-Turn child test result to view details
3. Locate the **Attachments** section
4. Copy the **Actual Attachment JSON** displayed to clipboard
<img width="1688" height="795" alt="image" src="https://github.com/user-attachments/assets/3ca20faf-6e10-4ae0-aa52-4bd775072986" />



### Step 6: Update Multi-Turn child test with Captured JSON

1. Navigate back to your test set
2. **Edit** Multi-Turn child test
3. Replace the empty array `[]` within Expected Attachments JSON column with the copied JSON from Step 5
4. Click **Save Test**
   <img width="1667" height="779" alt="image" src="https://github.com/user-attachments/assets/abcae465-aec6-4ed2-bcf5-98605178a0b7" />


### Step 7: Add Multi-Turn Child Test 2 - Invoke Actions

1. Click **+ New Agent Test** within Multi-Turn subgrid
2. Configure as follows:

| Field                 | Value                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test Type             | Attachments (Adaptive Cards, etc.)                                                                                                                        |
| Order                 | 2                                                                                                                                                         |
| Operation Type        | Invoke Actions                                                                                                                                            |
| Adaptive Card Payload | `{"action": "Allow", "id": "submit", "shouldAwaitUserInput": true}` (This is taken from Adaptive Card JSON which you have copied; check screenshot below) |
| Comparison Operator   | Contains Data/Equals (Depends on your response)                                                                                                           |
| Expected Response     | (Leave blank or specify as per your test utterance)                                                                                                       |
<img width="838" height="257" alt="image" src="https://github.com/user-attachments/assets/d63d9216-78dd-4399-bb28-a70f9bc2cd17" />

<img width="1674" height="689" alt="image" src="https://github.com/user-attachments/assets/9afb017f-87c6-4367-a746-33c177b1311f" />

3. Click **Save Test**

### Step 8: Final Test Set Validation

1. Save Connection Authorization Flow Test Set and execute it.
2. Verify results:

**Expected Results:**

- Test 1: ✅ PASSED
- Test 2: ✅ PASSED

---
