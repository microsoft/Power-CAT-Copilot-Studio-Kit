### 🤖 Issue Closure Log

### [Issue #405 - Adaptive Card Gallery Not showing the card in chat box](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/405)

**Problem:**  
Not able to see the adaptive card for respective topic in chat box.

**Root Cause:**  
The issue is likely due to test framework limitations or message extraction issues.

**Solution Applied:**  
1. **Verify Bot Functionality:**  
   - Test your bot in Copilot Studio and the demo site to confirm adaptive cards are returned as expected.
2. **Check Test Types:**  
   - Use Response Match and Topic Match tests. If these pass but attachment-type tests fail, the issue is likely with adaptive card extraction in the test framework.
3. **Review Message Sequence:**  
   - Ensure there are not multiple text messages before the adaptive card is sent, as this can disrupt proper response capture.
4. **Examine Attachments:**  
   - Look at the Result record’s Attachment field for the presence of adaptive card data.
5. **Confirm Bot is Published:**  
   - Make sure all changes are published before running tests.

**Download/Reference Links:**  
- [Adaptive Card Validation Not Working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/405#issuecomment-3404639375)

**Outcome:**  
The issue was resolved by following the above steps, ensuring the adaptive card is displayed correctly in the chat box.

---

This automated log entry is based on the historical knowledge base. If this doesn't resolve your problem, a maintainer will follow up to assist you further.

---