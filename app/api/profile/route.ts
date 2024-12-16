import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getRedditAccessToken() {
  const basicAuth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'web:reddit-profiler:v1.0.0 (by /u/' + process.env.REDDIT_USERNAME + ')',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: process.env.REDDIT_USERNAME || '',
      password: process.env.REDDIT_PASSWORD || '',
    }),
  });

  if (!response.ok) {
    console.error('Token Error:', await response.text());
    throw new Error('Failed to get Reddit access token');
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchRedditComments(username: string) {
  try {
    const accessToken = await getRedditAccessToken();

    const response = await fetch(
      `https://oauth.reddit.com/user/${username}/comments?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'web:reddit-profiler:v1.0.0 (by /u/' + process.env.REDDIT_USERNAME + ')',
        },
      }
    );

    if (response.status === 404) {
      throw new Error('User not found');
    }

    if (!response.ok) {
      console.error('Reddit API Error:', await response.text());
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.data || !data.data.children) {
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
    console.error('Error fetching Reddit comments:', error);
    throw error;
  }
}

async function generateProfile(comments: string[]) {
  try {
    const commentText = comments.join(' ').slice(0, 6000);
    
    const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      max_tokens: 500,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating profile:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const comments = await fetchRedditComments(username);
    const profile = await generateProfile(comments);
    
    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error('Profile generation error:', error);
    
    if (error.message === 'User not found') {
      return NextResponse.json(
        { error: 'Reddit user not found' },
        { status: 404 }
      );
    } else if (error.message === 'No comments found for this user') {
      return NextResponse.json(
        { error: 'This user has no public comments' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate profile' },
      { status: 500 }
    );
  }
}