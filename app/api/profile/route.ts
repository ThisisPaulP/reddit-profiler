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

async function getRedditToken() {
  console.log('getRedditToken - Starting token acquisition');
  try {
    const basicAuth = Buffer.from(
      `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
    ).toString('base64');
    console.log('getRedditToken - Created basic auth token');

    console.log('getRedditToken - Making request to Reddit OAuth endpoint');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'web:reddit-profiler:v1.0.0',
      },
      body: 'grant_type=client_credentials',
    });

    console.log('getRedditToken - Response status:', response.status);
    console.log('getRedditToken - Response status text:', response.statusText);

    if (!response.ok) {
      const error = await response.text();
      console.error('getRedditToken - Error response:', error);
      throw new Error(`Failed to get Reddit access token: ${error}`);
    }

    const data = await response.json();
    console.log('getRedditToken - Successfully obtained token');
    return data.access_token;
  } catch (error) {
    console.error('getRedditToken - Error:', error);
    throw error;
  }
}

async function fetchRedditComments(username: string) {
  console.log('fetchRedditComments - Starting for username:', username);
  try {
    const accessToken = await getRedditToken();
    console.log('fetchRedditComments - Got access token');

    const url = `https://oauth.reddit.com/user/${username}/comments?limit=100`;
    console.log('fetchRedditComments - Fetching from URL:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'web:reddit-profiler:v1.0.0',
      },
    });

    console.log('fetchRedditComments - Response status:', response.status);
    console.log('fetchRedditComments - Response status text:', response.statusText);

    if (response.status === 404) {
      console.log('fetchRedditComments - User not found');
      throw new Error('User not found');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('fetchRedditComments - API Error Response:', errorText);
      throw new Error(`Reddit API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('fetchRedditComments - Received data structure:', JSON.stringify(data, null, 2));
    
    if (!data || !data.data || !data.data.children) {
      console.error('fetchRedditComments - Invalid API response format:', JSON.stringify(data, null, 2));
      throw new Error('Invalid response format from Reddit');
    }

    const comments = data.data.children
      .filter((child: any) => child.data && child.data.body)
      .map((child: any) => child.data.body);

    console.log(`fetchRedditComments - Found ${comments.length} valid comments`);
    
    if (comments.length === 0) {
      console.log('fetchRedditComments - No comments found');
      throw new Error('No comments found for this user');
    }

    return comments;
  } catch (error) {
    console.error('fetchRedditComments - Error:', error);
    throw error;
  }
}

async function generateProfile(comments: string[]) {
  console.log('generateProfile - Starting with number of comments:', comments.length);
  
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000; // 30 seconds timeout
  
  try {
    const commentText = comments.join(' ').slice(0, 6000);
    console.log('generateProfile - Prepared comment text length:', commentText.length);
    
    const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;
    
    console.log('generateProfile - Making OpenAI API request');
    console.log('generateProfile - OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
    console.log('generateProfile - OpenAI Key length:', process.env.OPENAI_API_KEY?.length || 0);

    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`generateProfile - Attempt ${attempt} of ${MAX_RETRIES}`);
      
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('OpenAI API request timeout')), TIMEOUT_MS);
        });

        // Create the OpenAI API request promise
        const openaiPromise = openai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4",
          max_tokens: 500,
          temperature: 0.7,
        });

        // Race between timeout and actual request
        const completion = await Promise.race([openaiPromise, timeoutPromise]) as OpenAI.Chat.ChatCompletion;
        console.log('generateProfile - OpenAI request successful');
        
        if (!completion?.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from OpenAI');
        }

        return completion.choices[0].message.content;
      } catch (error) {
        lastError = error;
        console.error(`generateProfile - Attempt ${attempt} failed:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`generateProfile - Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all retries failed
    throw new Error(lastError instanceof Error ? lastError.message : 'Failed after all retry attempts');
  } catch (error) {
    console.error('generateProfile - Final error:', error);
    throw error;
  }
}
    } catch (error) {
      console.error('generateProfile - OpenAI API Error:', error);
      throw error;
    }
  } catch (error) {
    console.error('generateProfile - Error:', error);
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