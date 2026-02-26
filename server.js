require('dotenv').config();
const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Validate required env vars
if (!process.env.ADMIN_PASSPHRASE || !process.env.JWT_SECRET) {
  console.error('Missing required environment variables: ADMIN_PASSPHRASE and JWT_SECRET must be set in .env');
  process.exit(1);
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Ensure data.json exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    cb(null, extOk && mimeOk);
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Helpers ---

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// --- API Routes ---

// POST login
app.post('/api/auth/login', (req, res) => {
  const { passphrase } = req.body;

  if (!passphrase || passphrase !== process.env.ADMIN_PASSPHRASE) {
    return res.status(401).json({ error: 'Invalid passphrase' });
  }

  const token = jwt.sign({ authenticated: true }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

// GET all markers
app.get('/api/markers', (_req, res) => {
  try {
    const markers = readData();
    res.json(markers);
  } catch (err) {
    console.error('Error reading markers:', err);
    res.status(500).json({ error: 'Failed to read markers' });
  }
});

// POST new marker (with optional image upload)
app.post('/api/markers', authenticateToken, upload.array('images', 10), (req, res) => {
  try {
    const { title, description, lat, lng } = req.body;

    if (!title || lat == null || lng == null) {
      return res.status(400).json({ error: 'title, lat, and lng are required' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers' });
    }

    const images = (req.files || []).map(f => '/uploads/' + f.filename);

    const markers = readData();
    const newMarker = {
      id: Date.now().toString(),
      title,
      description: description || '',
      lat: parsedLat,
      lng: parsedLng,
      images,
      createdAt: new Date().toISOString()
    };

    markers.push(newMarker);
    writeData(markers);

    res.status(201).json(newMarker);
  } catch (err) {
    console.error('Error creating marker:', err);
    res.status(500).json({ error: 'Failed to create marker' });
  }
});

// DELETE marker
app.delete('/api/markers/:id', authenticateToken, (req, res) => {
  try {
    let markers = readData();
    const marker = markers.find(m => m.id === req.params.id);

    if (!marker) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    // Remove associated image files
    (marker.images || []).forEach(imgPath => {
      const fullPath = path.join(__dirname, imgPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });

    markers = markers.filter(m => m.id !== req.params.id);
    writeData(markers);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting marker:', err);
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
