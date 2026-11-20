import type { PromptTip } from './types';

/**
 * 20 prompt engineering tips displayed in the Tips carousel.
 * Each tip has a step number, headline fact, and detailed description with examples.
 * Source: PromptOptimizationFactsTable from Prompt Advisor Studio.msapp
 */
export const PROMPT_TIPS: PromptTip[] = [
  {
    step: 1,
    fact: 'Be clear and concise',
    description: 'Clear, concise prompts reduce ambiguity, allowing GPT to better interpret your query. GPT models work by predicting the next word based on patterns, and a well-structured prompt narrows the focus, reducing the likelihood of irrelevant or unclear responses.\n\nFor example, instead of asking \'What do you know about marketing strategies?\' ask \'List three effective marketing strategies for increasing brand awareness.\' This gives the model a specific task, reducing the chances of irrelevant information.',
  },
  {
    step: 2,
    fact: 'Provide context',
    description: 'Giving context allows GPT to make better predictions based on your needs. GPT lacks memory across interactions, so it interprets each prompt individually. Providing background information helps the model generate more accurate, context-aware responses.\n\nFor instance, instead of \'Explain financial performance,\' say \'Explain the financial performance of a retail company during Q4 2023, focusing on revenue, profit, and costs.\' Since GPT lacks memory of past prompts, giving detailed context improves the response.',
  },
  {
    step: 3,
    fact: 'Use examples',
    description: 'Examples guide GPT by showing the desired output, effectively setting expectations for the response. GPT learns from patterns in the training data, so examples help it align responses with your intended format or style.\n\nFor example, \'Write an email to a client about a product launch\' can be expanded to \'Write an email to a client announcing the launch of our new product, similar to this example: Dear [Client], we\'re excited to introduce….\' The model aligns more closely with your intended style.',
  },
  {
    step: 4,
    fact: 'Iterate and experiment',
    description: 'Different phrasings can lead to different results because GPT\'s responses are probabilistic, not deterministic. Experimentation helps identify which prompts lead to the best output by testing various approaches to prompt structure. Testing multiple prompts uncovers the most effective approach.\n\nFor example, try different phrasings of a request like \'What are the best marketing strategies?\' and \'List top marketing strategies to increase customer engagement.\' GPT\'s probabilistic nature means slight changes can yield different results, helping you find the best fit.',
  },
  {
    step: 5,
    fact: 'Be specific',
    description: 'Specific prompts help GPT narrow its focus, reducing ambiguity. By defining clear boundaries or asking for a particular type of information, you ensure the model generates responses that match your expectations.\n\nFor example, instead of \'Give advice on improving customer service,\' try \'Provide three tips for improving customer service at a mid-sized retail store.\' Specificity reduces ambiguity and keeps responses focused on your needs.',
  },
  {
    step: 6,
    fact: 'Avoid ambiguity',
    description: 'Ambiguity confuses GPT because it relies on patterns learned from vast datasets. If terms are unclear, GPT may default to less relevant information, diluting the accuracy of responses. Avoiding vague phrasing keeps responses on target.\n\nInstead of \'Tell me about leadership,\' say \'Explain the key traits of effective leadership in a remote work environment.\' This reduces the risk of GPT interpreting the question too broadly, improving response quality.',
  },
  {
    step: 7,
    fact: 'Test and refine',
    description: 'GPT models improve responses through iterative refinement. Testing different prompts lets you see which version GPT responds to best. Fine-tuning improves accuracy because even small changes can shift the probabilities for word generation.\n\nFor example, if \'List ways to improve customer retention\' yields generic responses, refine to \'List three data-driven strategies for improving customer retention in the SaaS industry.\' Small changes can significantly improve output.',
  },
  {
    step: 8,
    fact: 'Utilize feedback',
    description: 'Using feedback helps refine prompts by addressing weaknesses. GPT\'s outputs are based on the training data, and fine-tuning with feedback or tweaking prompts based on earlier results leads to clearer, more relevant answers.\n\nIf the model\'s response isn\'t what you expect, you can adjust accordingly. For example, if asking \'Summarize quarterly performance\' yields an incomplete answer, refine with feedback like \'Summarize revenue, expenses, and profitability for Q2 2024.\'',
  },
  {
    step: 9,
    fact: 'Learn from others',
    description: 'Studying successful prompts reveals how certain phrasing or context settings guide GPT effectively. GPT responds well to prompts that mimic structured patterns in the training data, so learning from others offers insights into what works best.',
  },
  {
    step: 10,
    fact: 'Limit open-ended questions',
    description: 'Open-ended questions can result in too broad or unfocused responses. GPT models are trained on diverse data, so they interpret broad questions in many ways. Constraining the scope helps focus the model on more relevant outputs.\n\nInstead of asking \'What can you tell me about the software industry?\' say \'What are the three key trends impacting the software industry in 2024?\' This encourages more specific and relevant answers from GPT.',
  },
  {
    step: 11,
    fact: 'Use constraints',
    description: 'Constraining output limits, such as word counts or formats, helps GPT stay within desired boundaries. Since GPT generates text probabilistically, setting limits prevents overly verbose or unstructured outputs, ensuring better alignment with your goals.\n\nFor instance, \'Provide a 100-word summary of this report\' helps GPT focus on brevity, whereas \'Explain this topic\' could lead to an overly detailed response. Constraints help control the scope of the output.',
  },
  {
    step: 12,
    fact: 'Define roles',
    description: 'Assigning a role (e.g., \'as an expert\') provides GPT with a specific context to operate within. This helps the model simulate more accurate and relevant responses by aligning the role with patterns found in expert or authoritative texts.\n\nFor example, \'As a financial analyst, provide an assessment of the company\'s Q3 earnings\' guides GPT to respond in a more authoritative, specialized manner, leveraging relevant knowledge patterns from similar roles.',
  },
  {
    step: 13,
    fact: 'Specify output format',
    description: 'GPT responds better when it knows the desired structure, such as requesting bullet points or tables. By specifying the format, you guide the model toward generating outputs that match the organizational style you need.\n\nFor example, instead of \'Explain the report findings,\' you can request \'Explain the report findings in bullet points with three recommendations.\' This guides GPT to organize the response according to your preferences.',
  },
  {
    step: 14,
    fact: 'Ask for step-by-step responses',
    description: 'Step-by-step guidance helps GPT structure its answers clearly. Because GPT can generate large blocks of text, breaking the request into steps ensures it stays focused on logical progression and details.\n\nFor instance, \'Explain how to conduct a market analysis step-by-step\' ensures GPT provides a more detailed and logical breakdown than just a general explanation.',
  },
  {
    step: 15,
    fact: 'Use consistent terminology',
    description: 'Consistency helps GPT avoid confusion, as it predicts word sequences based on prior context. Switching terms or introducing synonyms mid-prompt can introduce ambiguity, leading to less focused answers.\n\nFor example, avoid switching between \'client\' and \'customer\' in the same prompt. Instead, use \'customer\' throughout to ensure GPT recognizes the same concept consistently, improving the clarity of responses.',
  },
  {
    step: 16,
    fact: 'Clarify assumptions',
    description: 'Assumptions provide clarity, helping GPT fill in necessary gaps without making incorrect inferences. Stating assumptions upfront reduces the risk of the model defaulting to irrelevant or incorrect information from its broad training data.\n\nFor example, instead of \'How should I improve customer service?\' clarify with \'Assume the business is an online retail store—how should I improve customer service?\' This helps GPT generate more tailored advice.',
  },
  {
    step: 17,
    fact: 'Ask the model to think aloud',
    description: 'Encouraging GPT to \'explain its reasoning\' can result in more transparent and logical responses. By prompting it to break down its thought process, you get answers that are easier to understand and evaluate.\n\nFor example, ask \'Explain your reasoning for recommending these marketing strategies.\' This prompts GPT to provide a more transparent and logical explanation of its suggestions.',
  },
  {
    step: 18,
    fact: 'Start simple and build complexity',
    description: 'Simple prompts let GPT focus on the core question. Gradually adding complexity helps build more detailed and refined responses, as the model processes smaller bits of information in a logical sequence.\n\nFor example, start with \'What are the key factors in customer satisfaction?\' and then ask \'How can these factors be applied in a subscription business model?\' Complex prompts benefit from incremental clarity.',
  },
  {
    step: 19,
    fact: 'Leverage follow-up questions',
    description: 'Follow-up questions let you clarify or expand on initial responses. GPT processes each input independently, so follow-ups help ensure the conversation stays on track and focused on your evolving needs.\n\nFor instance, after asking \'What are common sales challenges?\' you can follow up with \'How can a mid-sized retail company address these challenges?\' This allows GPT to build on the previous answer, improving the specificity and relevance.',
  },
  {
    step: 20,
    fact: 'Balance creativity and control',
    description: 'Allowing some creativity gives GPT flexibility to generate diverse outputs. However, too much freedom can lead to off-topic responses, so providing guidelines or constraints helps maintain focus while encouraging creative problem-solving.\n\nFor example, in a brainstorming session, you could ask \'Suggest five innovative product ideas for the healthcare sector, ensuring each idea can be implemented with existing technologies.\' This keeps creativity focused.',
  },
];
