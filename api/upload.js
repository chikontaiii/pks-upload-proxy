import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    console.log('Fields:', JSON.stringify(fields, null, 2));
    console.log('Files:', JSON.stringify(files, null, 2));

    const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject;
    const displayName = Array.isArray(fields.displayName) ? fields.displayName[0] : fields.displayName;
    const type = Array.isArray(fields.type) ? fields.type[0] : fields.type;
    const file = files.file;

    if (!subject || !displayName || !type || !file) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Определяем путь к файлу (разные версии formidable используют разные ключи)
    let filePath = null;
    if (file.filepath) filePath = file.filepath;
    else if (file.path) filePath = file.path;
    else if (file._writeStream && file._writeStream.path) filePath = file._writeStream.path;
    else if (Array.isArray(file) && file[0]) {
      // Если файл пришёл как массив
      if (file[0].filepath) filePath = file[0].filepath;
      else if (file[0].path) filePath = file[0].path;
    }

    if (!filePath) {
      console.error('Could not determine file path. File object:', file);
      return res.status(500).json({ error: 'File path is missing' });
    }

    const owner = process.env.REPO_OWNER;
    const repo = process.env.REPO_NAME;
    const token = process.env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      console.error('Missing environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = file.originalFilename || file.name || 'file';
      const branch = 'main';
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
        console.error('GitHub API error:', data);
        return res.status(response.status).json({ error: data.message });
      }

      const fileUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;

      // Удаляем временный файл
      fs.unlinkSync(filePath);

      return res.status(200).json({
        fileUrl,
        fileName,
        subject,
        displayName,
        type,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      return res.status(500).json({ error: error.message });
    }
  });
}
