'use client';

import { useState } from 'react';

export default function Home() {
  const [username, setUsername] = useState('');
  const [profile, setProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateProfile = async () => {
    setLoading(true);
    setError('');
    setProfile('');
    
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }), // Trim whitespace
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate profile');
      }

      setProfile(data.profile);
    } catch (err: any) {
      setError(err.message || 'Failed to generate profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    // Clear error when user starts typing again
    if (error) setError('');
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Reddit User Profiler</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reddit Username
            </label>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Enter Reddit username (e.g., spez)"
              className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mb-4">
              Username must be 3-20 characters long and contain only letters, numbers, underscores, or hyphens.
            </p>
            <button
              onClick={generateProfile}
              disabled={loading || !username.trim()}
              className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating Profile...' : 'Generate Profile'}
            </button>
          </div>

          {error && (
            <div className="text-red-500 p-3 bg-red-50 rounded-md mb-4">
              {error}
            </div>
          )}

          {profile && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h2 className="text-xl font-semibold mb-2">User Profile</h2>
              <p className="whitespace-pre-wrap text-gray-700">{profile}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}