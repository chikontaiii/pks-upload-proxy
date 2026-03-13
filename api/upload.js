import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject;
    const displayName = Array.isArray(fields.displayName) ? fields.displayName[0] : fields.displayName;
    const type = Array.isArray(fields.type) ? fields.type[0] : fields.type;
    const file = files.file;

    if (!subject || !displayName || !type || !file) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Читаем файл
    const fileBuffer = fs.readFileSync(file.filepath);
    const fileName = file.originalFilename;

    // GitHub параметры из переменных окружения
    const owner = process.env.REPO_OWNER;
    const repo = process.env.REPO_NAME;
    const branch = 'main';
    const token = process.env.GITHUB_TOKEN;

    const path = `${subject}/${Date.now()}_${fileName}`;
    const base64Content = fileBuffer.toString('base64');

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload ${fileName}`,
        content: base64Content,
        branch: branch,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('GitHub error:', data);
      return res.status(response.status).json({ error: data.message });
    }

    const fileUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;

    res.status(200).json({
      fileUrl,
      fileName,
      subject,
      displayName,
      type,
    });
  });
}
