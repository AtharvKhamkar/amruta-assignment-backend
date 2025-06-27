const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { v2: cloudinary } = require('cloudinary');

dotenv.config();



const app = express();


const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));




app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory data storage
let submissions = [];

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer setup for memory buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /submit
app.post('/submit', upload.single('video'), async (req, res) => {
  const { name, email, company, location, template } = req.body;
  const videoBuffer = req.file.buffer;
  const finalId = Date.now().toString();

  try {
    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'video_templates',
            public_id: `user_${finalId}`,
            overwrite: true,
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        stream.end(buffer);
      });
    };

    const result = await streamUpload(videoBuffer);
    const videoUrl = result.secure_url;
    const pageUrl = `${process.env.FRONTEND_URL}/user/${finalId}`;

    // QR code
    const qrDir = 'uploads/qrcodes';
    fs.mkdirSync(qrDir, { recursive: true });
    const qrCodePath = `${qrDir}/${finalId}.png`;

    await QRCode.toFile(qrCodePath, pageUrl);
    const qrRelativePath = `/${qrCodePath}`;

    // Store submission
    const submission = {
      id: finalId,
      name,
      email,
      company,
      location,
      template,
      videoUrl,
      qrPath: qrRelativePath,
      pageUrl,
    };

    submissions.push(submission);

    // Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: process.env.MAIL_REJECT_UNAUTHORIZED === 'true',
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_SENDER,
      to: process.env.ADMIN_EMAIL,
      subject: 'New Video Submission',
      text: `New video submitted by ${name}.\n\nView it at: ${pageUrl}`,
    });

    res.json({ id: finalId });
  } catch (err) {
    console.error('Error during submission:', err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// GET /user/:id
app.get('/user/:id', (req, res) => {
  const data = submissions.find(s => s.id === req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// GET /admin/submissions
app.get('/admin/submissions', (req, res) => {
  res.json(submissions);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
