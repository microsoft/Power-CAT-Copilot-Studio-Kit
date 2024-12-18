# Prompt Advisor

## Refine your AI Builder custom prompts (preview)

Develop effective prompts while learning useful prompt engineering skills with the **Prompt advisor tool**.  
Users can enter a prompt and receive a confidence evaluation with detailed reasoning for the score. Additionally, the tool provides a list of suggested refined prompts implementing various prompt techniques. Users can select from these optimized prompts to iteratively refine and improve their input.

> ### Important  
> - This is a **preview feature**.  
> - Preview features aren’t meant for production use and might have restricted functionality. These features are available before an official release so that customers can get early access and provide feedback.

![image (1)](https://github.com/user-attachments/assets/5c0efa74-f97f-402a-8e1c-cb8242a810e2)

### Prerequisites

1. A **Microsoft Dataverse Environment** with [AI Builder prompts enabled in the admin center](https://learn.microsoft.com/ai-builder/administer#enable-or-disable-ai-builder-preview-features) and Copilot Studio Kit
1. **Permissions requirements**: System customizer security role.
1. **AI Builder credits**: Ensure [AI Builder credits](https://learn.microsoft.com/ai-builder/credit-management) are assigned to your environment.

---

## Fine tune your prompt

Using the **prompt advisor** involves an iterative process where you enter a prompt, analyze it to receive a 
confidence score and feedback, and then refine the prompt based on the provided suggestions. This 
cycle is repeated until the prompt achieves a high confidence score. 

1. **Enter a prompt**: Type the prompt you want to analyze.
![4 - Copy](https://github.com/user-attachments/assets/d0fb1e2f-4923-41ca-8967-7d7108e1b2d6)
1. **Click Analyze**: Evaluate your prompt.  
1. **View confidence score**: Observe the score and feedback on the evaluation pane.
![5 - Copy](https://github.com/user-attachments/assets/ef14f920-d1ab-4f0f-a73c-90ba08202b19)
1. **Review refined prompts**:  
   - Click the expand button to view suggestions in full screen.
![6 - Copy](https://github.com/user-attachments/assets/edeb0fd6-8e9e-4b79-bc85-4e428fbb2fcc)
   - Filter prompts using the technique dropdown menu.
![7 - Copy](https://github.com/user-attachments/assets/909ea9a7-e41a-42f1-b7a1-bb697ef3a7da)
1. **Select a refined prompt**: Choose a suggested prompt to improve your input.
![8 - Copy](https://github.com/user-attachments/assets/6d219336-5686-4658-9eff-86a053f78fb4)
1. **Click Apply and refine**: Iterate based on feedback to improve the confidence score.
![9 - Copy](https://github.com/user-attachments/assets/05939dfe-0719-44b3-877c-327cfaa83bda)
Repeat steps 1-6 until you've reached an acceptable confidence score, or the prompt satisfies the 
needs for your use case. As you learn more about prompt engineering, you may observe it as an 
iterative process.
1. **Copy the prompt**: Paste the refined prompt into the [**AI Builder custom prompt studio**](https://learn.microsoft.com/ai-builder/create-a-custom-prompt).

---

## Interpreting the confidence score

The **confidence score** is a numerical value that indicates the likelihood that your prompt will yield 
accurate and relevant results. Here’s how to interpret it:

- **High (80-100):** This indicates that your prompt is well-structured and likely to produce accurate 
results. The reasoning provided will highlight the strengths of your prompt.  
- **Medium (50-79):** This suggests that your prompt is good but may need some improvements. The 
reasoning will point out areas that could be enhanced for better performance.  
- **Low (0-49):** This indicates that your prompt may not be effective and requires significant changes. 
The reasoning will provide feedback on what aspects need to be improved.

> **Tip**  
> If there are too few words entered, the evaluation might not be able to provide a response.

---

## Troubleshooting and FAQ

### What should I do if I don't see the Analyze button or get an AI Builder credits error?  

Ensure you have the necessary permissions and sufficient **AI Builder Credits** in your environment.

### How can I get more AI Builder Credits?  

Purchase additional credits through your Microsoft account or contact your administrator.

### Why is my confidence score low?  

The confidence score depends on clarity and relevance. Review the **evaluation pane feedback** to improve the prompt.
