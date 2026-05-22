'use strict';

const router = require('express').Router();
const multer = require('multer');
const { authGuard } = require('../middleware/tenant');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

router.post('/avatar', authGuard, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

    // ── Cloudinary ──────────────────────────────────────────────────────────
    if (provider === 'cloudinary') {
      let cloudinary;
      try { cloudinary = require('cloudinary').v2; }
      catch { return res.status(500).json({ error: 'Cloudinary not installed. Run: npm install cloudinary' }); }

      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(500).json({ error: 'CLOUDINARY_CLOUD_NAME not set in environment variables' });
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'finstatement/avatars',
            transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
            public_id: `user_${req.user?.id}`,
            overwrite: true,
          },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      return res.json({ url: result.secure_url });
    }

    // ── AWS S3 / Backblaze B2 ───────────────────────────────────────────────
    if (provider === 's3') {
      let S3Client, PutObjectCommand;
      try {
        ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
      } catch {
        return res.status(500).json({ error: 'AWS SDK not installed. Run: npm install @aws-sdk/client-s3' });
      }

      const { v4: uuid } = require('uuid');
      const s3 = new S3Client({
        region:      process.env.S3_REGION || 'us-east-1',
        endpoint:    process.env.S3_ENDPOINT || undefined,
        credentials: {
          accessKeyId:     process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
      });

      const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
      const key = `avatars/user_${req.user?.id}.${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket:      process.env.S3_BUCKET,
        Key:         key,
        Body:        req.file.buffer,
        ContentType: req.file.mimetype,
        ACL:         'public-read',
      }));

      const url = process.env.S3_CDN_URL
        ? `${process.env.S3_CDN_URL}/${key}`
        : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      return res.json({ url });
    }

    // ── Local / Base64 fallback ─────────────────────────────────────────────
    // Works immediately with no setup — stored as base64 data URL
    // Fine for dev and internal tools — for production use Cloudinary or S3
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    return res.json({
      url: base64,
      warning: 'Using local base64 storage. Set STORAGE_PROVIDER=cloudinary in .env for production.',
    });

  } catch (err) {
    console.error('[Upload Error]', err.message);
    next(err);
  }
});

module.exports = router;
