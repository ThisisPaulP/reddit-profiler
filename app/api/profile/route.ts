import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY || !process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
  console.log('Missing API keys:', {
    openai: !!process.env.OPENAI_API_KEY,
    redditClientId: !!process.env.REDDIT_CLIENT_ID,
    redditClientSecret: !!process.env.REDDIT_CLIENT_SECRET
  });
}

// Function to clean Reddit usernames by removing any leading 'u/' or '/u/' if present
function cleanRedditUsername(username: string): string {
  return username.replace(/^\/?(u\/)?/i, '');
}

async function getRedditToken() {
  const basicAuth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'web:reddit-profiler:v1.0.0',
    },
    body: 'grant_type=client_credentials',
  });

  console.log('Reddit Token Fetch Response:', response.status);
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Token Error:', error);
    throw new Error('Failed to get Reddit access token');
  }

  const data = await response.json();
  console.log('Reddit Token Data:', data);
  return data.access_token;
}

async function fetchRedditComments(username: string) {
  try {
    const cleanUsername = cleanRedditUsername(username);
    console.log('Fetching comments for user:', cleanUsername);
    
    // Get access token
    const accessToken = await getRedditToken();
    console.log('Successfully obtained access token');

    // Fetch comments using the access token
    const response = await fetch(
      `https://oauth.reddit.com/user/${cleanUsername}/comments?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'web:reddit-profiler:v1.0.0',
        },
      }
    );

    console.log('Reddit API Comments Response:', response.status);
    
    if (response.status === 404) {
      throw new Error('User not found');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Reddit API Error Response:', errorText);
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.data || !data.data.children) {
      console.error('Invalid Reddit API response format:', data);
      throw new Error('Invalid response format from Reddit');
    }

    const comments = data.data.children
      .filter((child: any) => child.data && child.data.body)
      .map((child: any) => child.data.body);

    console.log(`Successfully fetched ${comments.length} comments`);
    return comments;
  } catch (error) {
    console.error('Error in fetchRedditComments:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

async function generateProfile(comments: string[]) {
  try {
    console.log('Generating profile from comments');
    const commentText = comments.join(' ').slice(0, 6000);
    
    const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;

    console.log('Sending request to OpenAI with prompt length:', prompt.length);
    
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      max_tokens: 500,
      temperature: 0.7,
    });

    console.log('OpenAI API response:', {
      status: completion.status,
      headers: completion.headers,
      choiceCount: completion.choices.length,
      firstChoiceContentLength: completion.choices[0].message.content.length
    });

    console.log('Successfully generated profile');
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error in generateProfile:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    console.log('Received request for username:', username);
    
    if (!username) {
      console.log('Error: Username is required');
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Clean the username by removing any leading 'u/' or '/u/'
    const cleanUsername = cleanRedditUsername(username);
    console.log('Cleaned username:', cleanUsername);

    const comments = await fetchRedditComments(cleanUsername);
    console.log('Comments fetched:', comments.length);

    const profile = await generateProfile(comments);
    console.log('Profile generated:', profile.length);
    
    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error('Profile generation error:', {
      message: error.message,
      stack: error.stack,
      status: error.status,
      type: error.name,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : undefined
    });
    
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