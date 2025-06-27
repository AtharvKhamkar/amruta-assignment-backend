const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { v2: cloudinary } = require('cloudinary');
const mongoose = require('mongoose');
const Submission = require('./models/submission');

dotenv.config();

const app = express();

// CORS setup
const corsOptions = {
  origin: '*', // or your frontend domain in production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};
app.use(cors(corsOptions));

// JSON parsing middleware
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer for handling video upload (in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /submit
app.post('/submit', upload.single('video'), async (req, res) => {
  const { name, email, company, location, template } = req.body;
  const videoBuffer = req.file?.buffer;
  const finalId = Date.now().toString();

  if (!videoBuffer) return res.status(400).json({ error: 'Video not uploaded' });

  try {
    // Upload video to Cloudinary
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

    const videoResult = await streamUpload(videoBuffer);
    const videoUrl = videoResult.secure_url;
    const pageUrl = `${process.env.FRONTEND_URL}/user/${finalId}`;

    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(pageUrl);

    // Upload QR code to Cloudinary
    const qrUploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'qr_codes',
          public_id: `qr_${finalId}`,
          overwrite: true,
        },
        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      stream.end(qrBuffer);
    });

    const qrPath = qrUploadResult.secure_url;

    // Save to MongoDB
    const submission = await Submission.create({
      id: finalId,
      name,
      email,
      company,
      location,
      template,
      videoUrl,
      qrPath,
      pageUrl,
    });

    // Send mail
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
app.get('/user/:id', async (req, res) => {
  try {
    const data = await Submission.findOne({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve submission' });
  }
});

// GET /admin/submissions
app.get('/admin/submissions', async (req, res) => {
  try {
    const data = await Submission.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
