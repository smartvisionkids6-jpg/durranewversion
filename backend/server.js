const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Database setup
const dbPath = process.env.DB_PATH || './database/app.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Categories table
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      description_ar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Images table
  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      title TEXT,
      title_ar TEXT,
      video_url TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
    )
  `);

  // Admin users table
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,gif,webp,mp4,mov,avi').split(',');
  const ext = path.extname(file.originalname).toLowerCase().substring(1);
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type .${ext} is not allowed`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: fileFilter
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Initialize admin user
const initializeAdmin = async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  
  db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, row) => {
    if (err) {
      console.error('Error checking admin user:', err);
      return;
    }
    
    if (!row) {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', 
        [username, hashedPassword], (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log(`Admin user created: ${username}`);
          }
        });
    }
  });
};

// API Routes

// Admin login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
// استبدل الـ route ده في ملف server.js

// Get all categories with images
// استبدل الـ categories route في server.js بالكود ده:

// Get all categories with images
app.get('/api/categories', (req, res) => {
  // Get categories with their properties and images
  const categoriesQuery = `
    SELECT 
      c.id,
      c.name as name_en,
      c.name_ar,
      c.description as description_en,
      c.description_ar,
      c.created_at,
      c.updated_at
    FROM categories c
    ORDER BY c.created_at DESC
  `;

  db.all(categoriesQuery, [], (err, categories) => {
    if (err) {
      console.error('Database error fetching categories:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (categories.length === 0) {
      return res.json([]);
    }

    // Get properties for each category
    const categoryIds = categories.map(cat => cat.id);
    const placeholders = categoryIds.map(() => '?').join(',');
    
    const propertiesQuery = `
      SELECT 
        p.id,
        p.category_id,
        p.title_en,
        p.title_ar,
        p.description_en,
        p.description_ar,
        p.location,
        p.video_url,
        p.featured,
        p.created_at
      FROM properties p
      WHERE p.category_id IN (${placeholders})
      ORDER BY p.featured DESC, p.created_at ASC
    `;

    db.all(propertiesQuery, categoryIds, (err, properties) => {
      if (err) {
        console.error('Database error fetching properties:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Get images for all properties
      const propertyIds = properties.map(prop => prop.id);
      if (propertyIds.length === 0) {
        const result = categories.map(category => ({
          ...category,
          properties: []
        }));
        return res.json(result);
      }

      const imagePlaceholders = propertyIds.map(() => '?').join(',');
      const imagesQuery = `
        SELECT 
          pi.id,
          pi.property_id,
          pi.image_url,
          pi.title_en,
          pi.title_ar,
          pi.sort_order
        FROM property_images pi
        WHERE pi.property_id IN (${imagePlaceholders})
        ORDER BY pi.property_id, pi.sort_order ASC
      `;

      db.all(imagesQuery, propertyIds, (err, images) => {
        if (err) {
          console.error('Database error fetching images:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        // Group images by property_id
        const imagesByProperty = {};
        images.forEach(image => {
          if (!imagesByProperty[image.property_id]) {
            imagesByProperty[image.property_id] = [];
          }
          imagesByProperty[image.property_id].push(image);
        });

        // Group properties by category_id
        const propertiesByCategory = {};
        properties.forEach(property => {
          if (!propertiesByCategory[property.category_id]) {
            propertiesByCategory[property.category_id] = [];
          }
          propertiesByCategory[property.category_id].push({
            ...property,
            images: imagesByProperty[property.id] || []
          });
        });

        // Combine categories with their properties
        const result = categories.map(category => ({
          ...category,
          properties: propertiesByCategory[category.id] || []
        }));

        console.log(`Returning ${result.length} categories with properties`);
        res.json(result);
      });
    });
  });
});

// Create new category
app.post('/api/categories', authenticateToken, (req, res) => {
  const { name, name_ar, description, description_ar } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const query = `
    INSERT INTO categories (name, name_ar, description, description_ar)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [name, name_ar, description, description_ar], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      success: true,
      id: this.lastID,
      message: 'Category created successfully'
    });
  });
});

// Update category
app.put('/api/categories/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, name_ar, description, description_ar } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const query = `
    UPDATE categories 
    SET name = ?, name_ar = ?, description = ?, description_ar = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [name, name_ar, description, description_ar, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      success: true,
      message: 'Category updated successfully'
    });
  });
});

// Delete category
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // First, get all images for this category to delete files
  db.all('SELECT filename FROM images WHERE category_id = ?', [id], (err, images) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Delete image files
    images.forEach(image => {
      const filePath = path.join(uploadsDir, image.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // Delete category (images will be deleted by CASCADE)
    db.run('DELETE FROM categories WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({
        success: true,
        message: 'Category and associated images deleted successfully'
      });
    });
  });
});

// Upload image
app.post('/api/images', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { category_id, title, title_ar, video_url } = req.body;

  if (!category_id) {
    // Delete uploaded file if category_id is missing
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Category ID is required' });
  }

  const query = `
    INSERT INTO images (category_id, filename, original_name, title, title_ar, video_url, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    category_id,
    req.file.filename,
    req.file.originalname,
    title,
    title_ar,
    video_url,
    req.file.size,
    req.file.mimetype
  ], function(err) {
    if (err) {
      // Delete uploaded file if database insert fails
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      success: true,
      id: this.lastID,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      message: 'Image uploaded successfully'
    });
  });
});

// Delete image
app.delete('/api/images/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // First get the filename to delete the file
  db.get('SELECT filename FROM images WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete the file
    const filePath = path.join(uploadsDir, row.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    db.run('DELETE FROM images WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    });
  });
});

// Health check endpoint
// Get contact information
app.get('/api/contact', (req, res) => {
  const contactQuery = `
    SELECT type, value, label_en, label_ar
    FROM contact_info
    ORDER BY created_at ASC
  `;

  db.all(contactQuery, [], (err, contacts) => {
    if (err) {
      console.error('Database error fetching contact info:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // Group contacts by type
    const contactInfo = {};
    contacts.forEach(contact => {
      if (!contactInfo[contact.type]) {
        contactInfo[contact.type] = [];
      }
      contactInfo[contact.type].push({
        value: contact.value,
        label_en: contact.label_en,
        label_ar: contact.label_ar
      });
    });

    res.json(contactInfo);
  });
});

// Get companies
app.get('/api/companies', (req, res) => {
  const companiesQuery = `
    SELECT name_en, name_ar
    FROM companies
    ORDER BY created_at ASC
  `;

  db.all(companiesQuery, [], (err, companies) => {
    if (err) {
      console.error('Database error fetching companies:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(companies);
  });
});

// Create property with images
app.post('/api/properties', authenticateToken, (req, res) => {
  const { category_id, title_en, title_ar, description_en, description_ar, location, video_url, featured, images } = req.body;

  if (!category_id) {
    return res.status(400).json({ error: 'Category ID is required' });
  }

  const query = `
    INSERT INTO properties (category_id, title_en, title_ar, description_en, description_ar, location, video_url, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    category_id,
    title_en,
    title_ar,
    description_en,
    description_ar,
    location,
    video_url,
    featured ? 1 : 0
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const propertyId = this.lastID;

    // Insert images if provided
    if (images && images.length > 0) {
      const imageStmt = db.prepare(`
        INSERT INTO property_images (property_id, image_url, title_en, title_ar, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);

      images.forEach((image, index) => {
        imageStmt.run(
          propertyId,
          image.url,
          image.title_en || null,
          image.title_ar || null,
          index
        );
      });

      imageStmt.finalize();
    }

    res.json({
      success: true,
      id: propertyId,
      message: 'Property created successfully'
    });
  });
});

// Update contact information
app.put('/api/contact', authenticateToken, (req, res) => {
  const { contacts } = req.body;

  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Contacts array is required' });
  }

  // Clear existing contacts and insert new ones
  db.run('DELETE FROM contact_info', [], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const stmt = db.prepare(`
      INSERT INTO contact_info (type, value, label_en, label_ar)
      VALUES (?, ?, ?, ?)
    `);

    contacts.forEach(contact => {
      stmt.run(contact.type, contact.value, contact.label_en, contact.label_ar);
    });

    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        success: true,
        message: 'Contact information updated successfully'
      });
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  initializeAdmin();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});