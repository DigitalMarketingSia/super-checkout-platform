import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { domain } = req.query;

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'Domain is required' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
  const TEAM_ID = process.env.VERCEL_TEAM_ID;

  if (!VERCEL_TOKEN || !PROJECT_ID) {
    console.error('Missing Vercel configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${domain}${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Vercel API Error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'Failed to remove domain' });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error removing domain:', error);
    return res.status(500).json({ error: error.message });
  }
}
