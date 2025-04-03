const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const db = new sqlite3.Database('./careconnect.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database');
    createTables();
  }
});

// Create necessary tables
function createTables() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    dob TEXT NOT NULL,
    phone TEXT NOT NULL,
    state TEXT NOT NULL
  )`);

  // Medicines table
  db.run(`CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    donor_id INTEGER,
    donor_email TEXT,
    donation_date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donor_id) REFERENCES users(id)
  )`);

  console.log('Database tables created');
}

// User Registration Route
app.post('/register', async (req, res) => {
  try {
    const { fullname, email, password, confirmPassword, dob, phone, state } = req.body;
    
    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if user already exists
    db.get('SELECT email FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (row) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      
      // Insert new user
      const sql = `INSERT INTO users (fullname, email, password, dob, phone, state) 
                  VALUES (?, ?, ?, ?, ?, ?)`;
      
      db.run(sql, [fullname, email, hashedPassword, dob, phone, state], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(201).json({ 
          message: 'User registered successfully',
          userId: this.lastID 
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Login Route
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      
      // Compare password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      
      // Login successful - return user data (without password)
      const { password: userPassword, ...userData } = user;
      return res.status(200).json({ 
        message: 'Login successful',
        userId: userData.id,
        email: userData.email
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete User Account
app.delete('/users/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Begin transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Update medicines donated by this user to be anonymous
      db.run('UPDATE medicines SET donor_id = NULL WHERE donor_id = ?', [userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }
        
        // Delete the user account
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }
          
          if (this.changes === 0) {
            db.run('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
          }
          
          db.run('COMMIT');
          return res.status(200).json({ message: 'Account deleted successfully' });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User's Donation History
app.get('/users/:userId/donations', (req, res) => {
  try {
    const userId = req.params.userId;
    
    const sql = `SELECT id, name, expiry_date, quantity, donation_date 
                FROM medicines 
                WHERE donor_id = ? 
                ORDER BY donation_date DESC`;
    
    db.all(sql, [userId], (err, donations) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      return res.status(200).json(donations);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Donate Medicine Route
app.post('/donate', (req, res) => {
  try {
    const { medicineName, expiry_date, quantity, donor_email } = req.body;
    
    // Find user by email
    db.get('SELECT id FROM users WHERE email = ?', [donor_email], (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      let donor_id = null;
      if (user) {
        donor_id = user.id;
      }
      
      // Insert medicine donation
      const sql = `INSERT INTO medicines (name, expiry_date, quantity, donor_id, donor_email)
                  VALUES (?, ?, ?, ?, ?)`;
      
      db.run(sql, [medicineName, expiry_date, quantity, donor_id, donor_email], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(201).json({ 
          message: 'Medicine donated successfully',
          donationId: this.lastID 
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Available Medicines Route
app.get('/medicines', (req, res) => {
  const sql = `SELECT m.id, m.name, m.expiry_date, m.quantity, m.donation_date, 
               m.donor_email, u.fullname as donor_name 
               FROM medicines m
               LEFT JOIN users u ON m.donor_id = u.id
               ORDER BY m.donation_date DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows);
  });
});

// Server start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});