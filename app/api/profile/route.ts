async function generateProfile(comments: string[]) {
  console.log('generateProfile - Starting with number of comments:', comments.length);
  
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000; // 30 seconds timeout
  let lastError: Error | null = null;
  
  const commentText = comments.join(' ').slice(0, 6000);
  console.log('generateProfile - Prepared comment text length:', commentText.length);
    
  const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;
    
  console.log('generateProfile - Making OpenAI API request');
  console.log('generateProfile - OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
  console.log('generateProfile - OpenAI Key length:', process.env.OPENAI_API_KEY?.length || 0);
    
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`generateProfile - Attempt ${attempt} of ${MAX_RETRIES}`);
      
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API request timeout')), TIMEOUT_MS);
      });

      const openaiPromise = openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4",
        max_tokens: 500,
        temperature: 0.7,
      });

      const completion = await Promise.race([openaiPromise, timeoutPromise]);
      console.log('generateProfile - OpenAI request successful');
        
      if (!completion?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenAI');
      }

      return completion.choices[0].message.content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error occurred');
      console.error(`generateProfile - Attempt ${attempt} failed:`, {
        error: lastError.message,
        name: lastError.name,
        stack: lastError.stack
      });
        
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`generateProfile - Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
    
  // If we get here, all retries failed
  console.error('generateProfile - All retry attempts failed');
  throw lastError || new Error('Failed after all retry attempts');
}