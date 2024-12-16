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
    
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate profile');
      }

      const data = await response.json();
      setProfile(data.profile);
    } catch (err) {
      setError('Failed to generate profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Reddit User Profiler</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-6">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Reddit username"
              className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={generateProfile}
              disabled={loading || !username}
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