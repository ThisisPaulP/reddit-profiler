import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to clean Reddit usernames by removing any leading 'u/' or '/u/' if present
function cleanRedditUsername(username: string): string {
  return username.replace(/^\/?(u\/)?/i, '');
}

// Function to log messages with a consistent format
function log(message: string, data?: any) {
  if (data) {
    console.log(`[LOG] ${message}`, data);
  } else {
    console.log(`[LOG] ${message}`);
  }
}

// Function to log errors with a consistent format
function logError(message: string, error?: any) {
  if (error) {
    console.error(`[ERROR] ${message}`, error);
  } else {
    console.error(`[ERROR] ${message}`);
  }
}

async function getRedditToken() {
  const basicAuth = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');

  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'web:reddit-profiler:v1.0.0',
    },
    body: 'grant_type=client_credentials',
  };

  log('Requesting Reddit access token', { url: 'https://www.reddit.com/api/v1/access_token', options: requestOptions });

  const response = await fetch('https://www.reddit.com/api/v1/access_token', requestOptions);

  log('Received response from Reddit access token request', { status: response.status, statusText: response.statusText });

  if (!response.ok) {
    const error = await response.text();
    logError('Failed to obtain Reddit access token', error);
    throw new Error('Failed to get Reddit access token');
  }

  const data = await response.json();
  log('Reddit access token obtained successfully', { access_token: data.access_token });
  return data.access_token;
}

async function fetchRedditComments(username: string) {
  try {
    const cleanUsername = cleanRedditUsername(username);
    log('Fetching comments for user', { username: cleanUsername });

    // Get access token
    const accessToken = await getRedditToken();

    // Fetch comments using the access token - limited to 5 comments
    const commentsUrl = `https://oauth.reddit.com/user/${cleanUsername}/comments?limit=6`;
    const commentsOptions = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'web:reddit-profiler:v1.0.0',
      },
    };

    log('Requesting Reddit comments', { url: commentsUrl, options: commentsOptions });

    const response = await fetch(commentsUrl, commentsOptions);

    log('Received response from Reddit comments request', { status: response.status, statusText: response.statusText });

    if (response.status === 404) {
      logError('Reddit user not found', { username: cleanUsername });
      throw new Error('User not found!');
    }

    if (!response.ok) {
      const errorText = await response.text();
      logError('Reddit API returned an error', { errorText });
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    log('Reddit comments data received', { data });

    if (!data || !data.data || !data.data.children) {
      logError('Invalid Reddit API response format', { data });
      throw new Error('Invalid response format from Reddit');
    }

    const comments = data.data.children
      .filter((child: any) => child.data && child.data.body)
      .map((child: any) => child.data.body);

    if (comments.length === 0) {
      logError('No comments found for user', { username: cleanUsername });
      throw new Error('No comments found for this user');
    }

    log(`Successfully fetched ${comments.length} comments for user`, { username: cleanUsername });
    return comments;
  } catch (error) {
    logError('Error in fetchRedditComments', error);
    throw error;
  }
}

async function generateProfile(comments: string[]) {
  try {
    log('Generating profile from comments');

    // Reduced comment text length to 1000 characters
    const commentText = comments.join(' ').slice(0, 1000);

    const prompt = `Analyze these recent Reddit comments and create a concise profile of the user, including their interests, personality traits, and recurring topics. Focus on creating a well-rounded understanding of their online persona. Comments: ${commentText}`;

    const completionRequest = {
      messages: [{ role: "user", content: prompt }],
      model: "chatgpt-4o-latest",
      max_tokens: 200,
      temperature: 0.7,
    };

    log('Sending request to OpenAI API', { prompt, completionRequest });

    const completion = await openai.chat.completions.create(completionRequest);

    log('Received response from OpenAI API', { completion });

    if (!completion || !completion.choices || !completion.choices[0].message) {
      logError('Invalid response format from OpenAI API', { completion });
      throw new Error('Invalid response format from OpenAI');
    }

    const profile = completion.choices[0].message.content;
    log('Successfully generated profile', { profile });

    return profile;
  } catch (error) {
    logError('Error in generateProfile', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    log('Received POST request', { url: req.url, method: req.method });

    const { username } = await req.json();
    log('Parsed request body', { username });

    if (!username) {
      logError('Username not provided in request');
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Clean the username by removing any leading 'u/' or '/u/'
    const cleanUsername = cleanRedditUsername(username);
    log('Cleaned username', { cleanUsername });

    const comments = await fetchRedditComments(cleanUsername);
    const profile = await generateProfile(comments);

    log('Sending successful response with profile', { profile });

    return NextResponse.json({ profile });
  } catch (error: any) {
    logError('Profile generation error', error);

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
