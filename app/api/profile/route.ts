import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanRedditUsername(username: string): string {
  console.log('cleanRedditUsername - Input username:', username);
  console.log('cleanRedditUsername - Type of username:', typeof username);
  
  const cleaned = username.replace(/^\/?(u\/)?/i, '').trim();
  console.log('cleanRedditUsername - After cleaning:', cleaned);
  return cleaned;
}

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

async function fetchRedditComments(username: string) {
  console.log('fetchRedditComments - Starting for username:', username);
  try {
    const basicAuth = Buffer.from(
      `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'web:reddit-profiler:v1.0.0',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Reddit access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const commentsResponse = await fetch(
      `https://oauth.reddit.com/user/${username}/comments?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'web:reddit-profiler:v1.0.0',
        },
      }
    );

    if (commentsResponse.status === 404) {
      throw new Error('User not found');
    }

    if (!commentsResponse.ok) {
      throw new Error(`Reddit API error: ${commentsResponse.status}`);
    }

    const data = await commentsResponse.json();
    
    if (!data?.data?.children) {
      throw new Error('Invalid response format from Reddit');
    }

    const comments = data.data.children
      .filter((child: any) => child.data && child.data.body)
      .map((child: any) => child.data.body);

    if (comments.length === 0) {
      throw new Error('No comments found for this user');
    }

    return comments;
  } catch (error) {
    console.error('fetchRedditComments - Error:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  console.log('POST - Starting request processing');
  try {
    const body = await req.json();
    console.log('POST - Request body:', body);
    
    const { username } = body;
    console.log('POST - Extracted username:', username);
    
    if (!username) {
      console.log('POST - No username provided');
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const cleanUsername = cleanRedditUsername(username);
    console.log('POST - Cleaned username:', cleanUsername);
    
    console.log('POST - Fetching comments');
    const comments = await fetchRedditComments(cleanUsername);
    
    console.log('POST - Generating profile');
    const profile = await generateProfile(comments);
    
    console.log('POST - Successfully generated profile, returning response');
    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error('POST - Error:', error);
    console.error('POST - Error stack:', error.stack);
    
    if (error.message.includes('User not found')) {
      return NextResponse.json(
        { error: 'Reddit user not found' },
        { status: 404 }
      );
    } else if (error.message.includes('No comments')) {
      return NextResponse.json(
        { error: 'This user has no public comments' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `Error: ${error.message}` },
      { status: 500 }
    );
  }
}