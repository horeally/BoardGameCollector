import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path, ...query } = req.query;

  // Build BGG API URL
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(query)) {
    if (typeof val === 'string') params.set(key, val);
  }
  const bggPath = Array.isArray(path) ? path.join('/') : path || '';
  const url = `https://boardgamegeek.com/xmlapi2/${bggPath}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.BGG_TOKEN}`,
      },
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status).send(text);
  } catch {
    res.status(500).send('BGG API request failed');
  }
}
