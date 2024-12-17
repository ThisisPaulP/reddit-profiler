import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function fetchRedditComments(username: string) {
  try {
    console.log('Fetching comments for user:', username);
    
    // Using public JSON API
    const response = await fetch(
      `https://www.reddit.com/user/${username}/comments/.json?limit=100`,
      {
        headers: {
          'User-Agent': `web:reddit-profiler:v1.0.0 (by /u/${process.env.REDDIT_USERNAME})`,
          'Accept': 'application/json',
        },
        next: {
          revalidate: 60 // Cache for 60 seconds
        }
      }
    );

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

    if (comments.length === 0) {
      throw new Error('No comments found for this user');
    }

    console.log(`Successfully fetched ${comments.length} comments`);
    return comments;
  } catch (error) {
    console.error('Error in fetchRedditComments:', error);
    throw error;
  }
}

async function generateProfile(comments: string[]) {
  try {
    console.log('Generating profile from comments');
    const commentText = comments.join(' ').slice(0, 6000);
    
    const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      max_tokens: 500,
      temperature: 0.7,
    });

    console.log('Successfully generated profile');
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error in generateProfile:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    console.log('Received request for username:', username);
    
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