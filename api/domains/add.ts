import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { domain } = req.body;

    if (!domain) {
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
            `https://api.vercel.com/v10/projects/${PROJECT_ID}/domains${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: domain }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            // Handle 409 (Conflict) - check if it's already ours
            if (response.status === 409) {
                console.log('Domain already exists, checking ownership...');
                try {
                    const checkResponse = await fetch(
                        `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${domain}${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
                        {
                            headers: {
                                Authorization: `Bearer ${VERCEL_TOKEN}`,
                            },
                        }
                    );

                    if (checkResponse.ok) {
                        const domainInfo = await checkResponse.json();
                        // It exists and is linked to this project. Return success.
                        return res.status(200).json(domainInfo);
                    }
                } catch (checkErr) {
                    console.error('Error checking existing domain:', checkErr);
                }
            }

            console.error('Vercel API Error:', data);
            return res.status(response.status).json({ error: data.error?.message || 'Failed to add domain to Vercel' });
        }

        return res.status(200).json(data);
    } catch (error: any) {
        console.error('Error adding domain:', error);
        return res.status(500).json({ error: error.message });
    }
}
